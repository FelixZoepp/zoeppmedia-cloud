import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';

const META_API_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;
const CLOSE_BASE = 'https://api.close.com/api/v1';
const CLOSE_PIPELINE_ID = 'pipe_5E14qCHzi8u3cHk0bB44ky';

function closeHeaders(): HeadersInit {
  const apiKey = process.env.CLOSE_API_KEY ?? '';
  return {
    Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
    'Content-Type': 'application/json',
  };
}

async function closeGet(path: string) {
  const res = await fetch(`${CLOSE_BASE}${path}`, { headers: closeHeaders() });
  if (!res.ok) throw new Error(`Close API error ${res.status}`);
  return res.json();
}

// ── Week helpers ────────────────────────────────────────────────────────────

function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function fmt(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function getWeekLabel(monday: Date): string {
  const sun = new Date(monday);
  sun.setDate(sun.getDate() + 6);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(monday.getDate())}.${pad(monday.getMonth() + 1)} – ${pad(sun.getDate())}.${pad(sun.getMonth() + 1)}`;
}

function getWeekNumber(d: Date): number {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
}

// ── Meta spend per week ─────────────────────────────────────────────────────

interface WeeklyMeta {
  spend: number;
  leads: number;
  impressions: number;
  clicks: number;
}

async function fetchMetaWeekly(token: string, adAccountId: string, weeks: { since: string; until: string }[]): Promise<Map<string, WeeklyMeta>> {
  const result = new Map<string, WeeklyMeta>();
  const fields = 'spend,impressions,clicks,actions';

  await Promise.all(
    weeks.map(async (w) => {
      const timeRange = JSON.stringify({ since: w.since, until: w.until });
      const url = `${META_BASE}/${adAccountId}/insights?access_token=${token}&time_range=${timeRange}&fields=${fields}&level=account`;
      try {
        const res = await fetch(url);
        const data = await res.json();
        const insight = data.data?.[0];
        if (insight) {
          const actions = insight.actions ?? [];
          const leadAction = actions.find((a: { action_type: string }) =>
            a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
          );
          result.set(w.since, {
            spend: parseFloat(insight.spend ?? '0'),
            leads: leadAction ? parseFloat(leadAction.value) : 0,
            impressions: parseInt(insight.impressions ?? '0', 10),
            clicks: parseInt(insight.clicks ?? '0', 10),
          });
        }
      } catch { /* skip week */ }
    })
  );

  return result;
}

// ── Close deals ─────────────────────────────────────────────────────────────

interface CloseDeal {
  id: string;
  lead_id: string;
  lead_name: string;
  status_label: string;
  status_type: string;
  value: number;
  date_created: string;
}

async function fetchCloseDeals(): Promise<CloseDeal[]> {
  const pipeline = await closeGet(`/pipeline/${CLOSE_PIPELINE_ID}/`);
  const statusMap: Record<string, { label: string; type: string }> = {};
  const validStatusIds = new Set<string>();
  for (const s of pipeline.statuses ?? []) {
    statusMap[s.id] = { label: s.label, type: s.type ?? 'active' };
    validStatusIds.add(s.id);
  }

  const allOppData = await closeGet(`/opportunity/?pipeline_id=${CLOSE_PIPELINE_ID}&_limit=200&_order_by=date_created`);
  const allOpps = (allOppData.data ?? []).filter(
    (o: { status_id: string }) => validStatusIds.has(o.status_id)
  );

  const uniqueLeadIds = Array.from(new Set(allOpps.map((o: { lead_id: string }) => o.lead_id))) as string[];
  const leadNames: Record<string, string> = {};
  await Promise.all(
    uniqueLeadIds.map(async (leadId) => {
      try {
        const lead = await closeGet(`/lead/${leadId}/?_fields=display_name`);
        leadNames[leadId] = lead.display_name ?? leadId;
      } catch {
        leadNames[leadId] = leadId;
      }
    })
  );

  return allOpps.map((opp: {
    id: string; lead_id: string; lead_name?: string; status_id: string;
    value?: number; date_created: string;
  }) => {
    const statusInfo = statusMap[opp.status_id] ?? { label: '', type: 'active' };
    return {
      id: opp.id,
      lead_id: opp.lead_id,
      lead_name: leadNames[opp.lead_id] ?? opp.lead_name ?? opp.lead_id,
      status_label: statusInfo.label,
      status_type: statusInfo.type,
      value: (opp.value ?? 0) / 100,
      date_created: opp.date_created,
    };
  });
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const admin = await isAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const weeksParam = parseInt(searchParams.get('weeks') ?? '12', 10);
  const numWeeks = Math.min(weeksParam, 52);

  // Build week ranges
  const now = new Date();
  const currentMonday = getMonday(now);
  const weekRanges: { since: string; until: string; monday: Date }[] = [];

  for (let i = 0; i < numWeeks; i++) {
    const monday = new Date(currentMonday);
    monday.setDate(monday.getDate() - i * 7);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    weekRanges.push({ since: fmt(monday), until: fmt(sunday), monday });
  }

  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  // Fetch Meta + Close in parallel
  const [metaWeekly, deals] = await Promise.all([
    token && adAccountId
      ? fetchMetaWeekly(token, adAccountId, weekRanges)
      : new Map<string, WeeklyMeta>(),
    fetchCloseDeals(),
  ]);

  // Group deals by week of creation
  const dealsByWeek = new Map<string, CloseDeal[]>();
  for (const deal of deals) {
    const created = new Date(deal.date_created);
    const monday = getMonday(created);
    const key = fmt(monday);
    if (!dealsByWeek.has(key)) dealsByWeek.set(key, []);
    dealsByWeek.get(key)!.push(deal);
  }

  // Build weekly rows
  const weeks = weekRanges.map((w) => {
    const meta = metaWeekly.get(w.since) ?? { spend: 0, leads: 0, impressions: 0, clicks: 0 };
    const weekDeals = dealsByWeek.get(w.since) ?? [];

    const label = (l: string) => l.toLowerCase();

    // Settings
    const settingGebucht = weekDeals.filter((d) => {
      const l = label(d.status_label);
      return l.includes('setting');
    }).length;
    const settingNoShow = weekDeals.filter((d) => label(d.status_label).includes('setting') && label(d.status_label).includes('no show')).length;
    const settingStattgefunden = weekDeals.filter((d) => {
      const l = label(d.status_label);
      // If deal progressed past setting (is now in closing, won, etc.), setting happened
      return l.includes('closing') || l.includes('angebot') || l.includes('cc2') || d.status_type === 'won';
    }).length;

    // Closings
    const closingGebucht = weekDeals.filter((d) => {
      const l = label(d.status_label);
      return l.includes('closing') || l.includes('angebot') || l.includes('cc2') || d.status_type === 'won';
    }).length;
    const closingNoShow = weekDeals.filter((d) => label(d.status_label).includes('closing') && label(d.status_label).includes('no show')).length;
    const closingStattgefunden = weekDeals.filter((d) => {
      const l = label(d.status_label);
      return (l.includes('angebot') || l.includes('cc2') || d.status_type === 'won' ||
        (l.includes('closing') && l.includes('follow')));
    }).length;

    // Won
    const wonDeals = weekDeals.filter((d) => d.status_type === 'won');
    const wonCount = wonDeals.length;
    const wonRevenue = wonDeals.reduce((s, d) => s + d.value, 0);

    // Lost
    const lostCount = weekDeals.filter((d) => d.status_type === 'lost').length;

    return {
      week_start: w.since,
      week_end: w.until,
      week_label: getWeekLabel(w.monday),
      kw: getWeekNumber(w.monday),
      // Meta
      spend: meta.spend,
      meta_leads: meta.leads,
      // Pipeline
      leads: weekDeals.length,
      setting_gebucht: settingGebucht,
      setting_no_show: settingNoShow,
      setting_stattgefunden: settingStattgefunden,
      closing_gebucht: closingGebucht,
      closing_no_show: closingNoShow,
      closing_stattgefunden: closingStattgefunden,
      won: wonCount,
      won_revenue: wonRevenue,
      lost: lostCount,
      // Calculated
      cpl: weekDeals.length > 0 ? Math.round((meta.spend / weekDeals.length) * 100) / 100 : 0,
      roas: meta.spend > 0 ? Math.round((wonRevenue / meta.spend) * 100) / 100 : 0,
      setting_show_rate: settingGebucht > 0
        ? Math.round(((settingGebucht - settingNoShow) / settingGebucht) * 1000) / 10
        : 0,
      closing_show_rate: closingGebucht > 0
        ? Math.round(((closingGebucht - closingNoShow) / closingGebucht) * 1000) / 10
        : 0,
    };
  });

  // Monthly aggregation
  const monthlyMap = new Map<string, typeof weeks>();
  for (const w of weeks) {
    const monthKey = w.week_start.slice(0, 7); // YYYY-MM
    if (!monthlyMap.has(monthKey)) monthlyMap.set(monthKey, []);
    monthlyMap.get(monthKey)!.push(w);
  }

  const months = Array.from(monthlyMap.entries())
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([month, monthWeeks]) => {
      const spend = monthWeeks.reduce((s, w) => s + w.spend, 0);
      const leads = monthWeeks.reduce((s, w) => s + w.leads, 0);
      const settingGebucht = monthWeeks.reduce((s, w) => s + w.setting_gebucht, 0);
      const settingNoShow = monthWeeks.reduce((s, w) => s + w.setting_no_show, 0);
      const closingGebucht = monthWeeks.reduce((s, w) => s + w.closing_gebucht, 0);
      const closingNoShow = monthWeeks.reduce((s, w) => s + w.closing_no_show, 0);
      const won = monthWeeks.reduce((s, w) => s + w.won, 0);
      const wonRevenue = monthWeeks.reduce((s, w) => s + w.won_revenue, 0);
      const lost = monthWeeks.reduce((s, w) => s + w.lost, 0);

      const [year, m] = month.split('-');
      const monthNames = ['', 'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
      const label = `${monthNames[parseInt(m, 10)]} ${year}`;

      return {
        month,
        label,
        spend,
        leads,
        setting_gebucht: settingGebucht,
        setting_no_show: settingNoShow,
        setting_show_rate: settingGebucht > 0 ? Math.round(((settingGebucht - settingNoShow) / settingGebucht) * 1000) / 10 : 0,
        closing_gebucht: closingGebucht,
        closing_no_show: closingNoShow,
        closing_show_rate: closingGebucht > 0 ? Math.round(((closingGebucht - closingNoShow) / closingGebucht) * 1000) / 10 : 0,
        won,
        won_revenue: wonRevenue,
        lost,
        cpl: leads > 0 ? Math.round((spend / leads) * 100) / 100 : 0,
        roas: spend > 0 ? Math.round((wonRevenue / spend) * 100) / 100 : 0,
        profit: wonRevenue - spend,
      };
    });

  return NextResponse.json({ weeks, months });
}
