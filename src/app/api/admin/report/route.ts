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

type Range = '7d' | '30d' | 'all';

function getDateRange(range: Range): { since: string; until: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);

  if (range === 'all') {
    const since = new Date(now);
    since.setDate(since.getDate() - 90);
    return { since: fmt(since), until: today };
  }

  const days = range === '7d' ? 7 : 30;
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  return { since: fmt(since), until: today };
}

// ── Meta Insights ───────────────────────────────────────────────────────────

interface MetaInsight {
  spend?: string;
  impressions?: string;
  clicks?: string;
  cpc?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
  campaign_id?: string;
  campaign_name?: string;
  ad_name?: string;
  adset_name?: string;
}

function extractLeads(insight: MetaInsight): number {
  const actions = insight.actions ?? [];
  const leadAction = actions.find(
    (a) => a.action_type === 'lead' || a.action_type === 'onsite_conversion.lead_grouped'
  );
  return leadAction ? parseFloat(leadAction.value) : 0;
}

async function fetchMetaInsights(token: string, adAccountId: string, since: string, until: string) {
  const timeRange = JSON.stringify({ since, until });
  const fields = 'spend,impressions,clicks,cpc,ctr,actions,cost_per_action_type';

  // Account-level
  const accountUrl = `${META_BASE}/${adAccountId}/insights?access_token=${token}&time_range=${timeRange}&fields=${fields}&level=account`;
  const accountRes = await fetch(accountUrl);
  const accountData = await accountRes.json();

  // Campaign-level
  const campaignUrl = `${META_BASE}/${adAccountId}/insights?access_token=${token}&time_range=${timeRange}&fields=${fields},campaign_id,campaign_name&level=campaign&limit=50`;
  const campaignRes = await fetch(campaignUrl);
  const campaignData = await campaignRes.json();

  // Ad-level
  const adFields = 'spend,impressions,clicks,actions,cost_per_action_type,ad_name,adset_name';
  const adUrl = `${META_BASE}/${adAccountId}/insights?access_token=${token}&time_range=${timeRange}&fields=${adFields}&level=ad&limit=100`;
  const adRes = await fetch(adUrl);
  const adData = await adRes.json();

  const accountInsight = accountData.data?.[0];
  const totalSpend = parseFloat(accountInsight?.spend ?? '0');
  const totalLeads = accountInsight ? extractLeads(accountInsight) : 0;
  const totalImpressions = parseInt(accountInsight?.impressions ?? '0', 10);
  const totalClicks = parseInt(accountInsight?.clicks ?? '0', 10);

  // Campaign breakdown
  const campaigns = (campaignData.data ?? []).map((c: MetaInsight) => ({
    id: c.campaign_id,
    name: c.campaign_name ?? '',
    spend: parseFloat(c.spend ?? '0'),
    leads: extractLeads(c),
    impressions: parseInt(c.impressions ?? '0', 10),
    clicks: parseInt(c.clicks ?? '0', 10),
  }));

  // Ad breakdown
  const ads = (adData.data ?? []).map((a: MetaInsight) => ({
    name: a.ad_name ?? '',
    adset: a.adset_name ?? '',
    spend: parseFloat(a.spend ?? '0'),
    leads: extractLeads(a),
    impressions: parseInt(a.impressions ?? '0', 10),
    clicks: parseInt(a.clicks ?? '0', 10),
  }));

  return {
    total: { spend: totalSpend, leads: totalLeads, impressions: totalImpressions, clicks: totalClicks },
    campaigns,
    ads,
  };
}

// ── Close CRM Pipeline ──────────────────────────────────────────────────────

type DealType = 'neukunde' | 'bestandskunde';
type FunnelStage = 'setting' | 'closing' | 'won' | 'lost';

interface PipelineDeal {
  id: string;
  lead_id: string;
  lead_name: string;
  status_label: string;
  status_type: string;
  value: number;
  deal_type: DealType;
  funnel_stage: FunnelStage;
  date_created: string;
}

async function fetchClosePipeline() {
  // Get pipeline statuses — only D2D pipeline status IDs
  const pipeline = await closeGet(`/pipeline/${CLOSE_PIPELINE_ID}/`);
  const statusMap: Record<string, { label: string; type: string }> = {};
  const validStatusIds = new Set<string>();
  for (const s of pipeline.statuses ?? []) {
    statusMap[s.id] = { label: s.label, type: s.type ?? 'active' };
    validStatusIds.add(s.id);
  }

  // Fetch all opportunities and strictly filter to D2D pipeline status IDs
  const allOppData = await closeGet(`/opportunity/?pipeline_id=${CLOSE_PIPELINE_ID}&_limit=200&_order_by=date_created`);
  const allOpps = (allOppData.data ?? []).filter(
    (o: { status_id: string }) => validStatusIds.has(o.status_id)
  );

  // Build first-opp-per-lead lookup
  const firstOppPerLead = new Map<string, string>();
  for (const opp of allOpps) {
    if (!firstOppPerLead.has(opp.lead_id)) {
      firstOppPerLead.set(opp.lead_id, opp.id);
    }
  }

  // Fetch lead names
  const uniqueLeadIds = Array.from(new Set(allOpps.map((o: { lead_id: string }) => o.lead_id))) as string[];
  const leadNames: Record<string, string> = {};
  await Promise.all(
    uniqueLeadIds.map(async (leadId: string) => {
      try {
        const lead = await closeGet(`/lead/${leadId}/?_fields=display_name`);
        leadNames[leadId] = lead.display_name ?? leadId;
      } catch {
        leadNames[leadId] = leadId;
      }
    })
  );

  // Classify deals
  const deals: PipelineDeal[] = allOpps.map((opp: {
    id: string; lead_id: string; lead_name?: string; status_id: string;
    status_label?: string; status_type?: string; value?: number;
    date_created: string;
  }) => {
    const statusInfo = statusMap[opp.status_id] ?? { label: opp.status_label ?? '', type: 'active' };
    const label = statusInfo.label.toLowerCase();

    let funnel_stage: FunnelStage = 'setting';
    if (statusInfo.type === 'won') {
      funnel_stage = 'won';
    } else if (statusInfo.type === 'lost') {
      funnel_stage = 'lost';
    } else if (label.includes('closing') || label.includes('angebot') || label.includes('cc2')) {
      funnel_stage = 'closing';
    } else {
      funnel_stage = 'setting';
    }

    return {
      id: opp.id,
      lead_id: opp.lead_id,
      lead_name: leadNames[opp.lead_id] ?? opp.lead_name ?? opp.lead_id,
      status_label: statusInfo.label,
      status_type: statusInfo.type,
      value: (opp.value ?? 0) / 100,
      deal_type: (firstOppPerLead.get(opp.lead_id) === opp.id ? 'neukunde' : 'bestandskunde') as DealType,
      funnel_stage,
      date_created: opp.date_created,
    };
  });

  return deals;
}

// ── Main Handler ────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const admin = await isAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = request.nextUrl;
  const range = (searchParams.get('range') ?? '30d') as Range;

  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  const { since, until } = getDateRange(range);

  // Fetch Meta + Close in parallel
  const [meta, deals] = await Promise.all([
    token && adAccountId
      ? fetchMetaInsights(token, adAccountId, since, until)
      : { total: { spend: 0, leads: 0, impressions: 0, clicks: 0 }, campaigns: [], ads: [] },
    fetchClosePipeline(),
  ]);

  // Funnel counts (from all deals, not date-filtered — pipeline is cumulative)
  const totalDeals = deals.length;
  const settingPlus = deals.filter((d) => ['setting', 'closing', 'won'].includes(d.funnel_stage)).length;
  const closingPlus = deals.filter((d) => ['closing', 'won'].includes(d.funnel_stage)).length;
  const wonDeals = deals.filter((d) => d.funnel_stage === 'won');
  const wonCount = wonDeals.length;
  const lostCount = deals.filter((d) => d.funnel_stage === 'lost').length;

  const neukundeWon = wonDeals.filter((d) => d.deal_type === 'neukunde');
  const bestandskundeWon = wonDeals.filter((d) => d.deal_type === 'bestandskunde');
  const neukundeRevenue = neukundeWon.reduce((s, d) => s + d.value, 0);
  const bestandskundeRevenue = bestandskundeWon.reduce((s, d) => s + d.value, 0);
  const totalRevenue = neukundeRevenue + bestandskundeRevenue;

  const spend = meta.total.spend;

  // Drop-off from each stage
  const settingOnly = deals.filter((d) => d.funnel_stage === 'setting').length;
  const closingOnly = deals.filter((d) => d.funnel_stage === 'closing').length;

  // Status breakdown for sub-status visibility (No Show, Follow Up, etc.)
  const statusBreakdown: Record<string, number> = {};
  for (const d of deals) {
    statusBreakdown[d.status_label] = (statusBreakdown[d.status_label] ?? 0) + 1;
  }

  // Setting sub-statuses
  const settingTerminiert = deals.filter((d) => d.status_label.toLowerCase().includes('setting') && d.status_label.toLowerCase().includes('terminiert')).length;
  const settingNoShow = deals.filter((d) => d.status_label.toLowerCase().includes('setting') && d.status_label.toLowerCase().includes('no show')).length;
  const settingFollowUp = deals.filter((d) => d.status_label.toLowerCase().includes('setting') && d.status_label.toLowerCase().includes('follow')).length;
  const settingShowRate = (settingTerminiert + settingNoShow + settingFollowUp) > 0
    ? Math.round(((settingTerminiert + settingFollowUp) / (settingTerminiert + settingNoShow + settingFollowUp)) * 1000) / 10
    : 0;

  // Closing sub-statuses
  const closingTerminiert = deals.filter((d) => d.status_label.toLowerCase().includes('closing') && d.status_label.toLowerCase().includes('terminiert')).length;
  const closingNoShow = deals.filter((d) => d.status_label.toLowerCase().includes('closing') && d.status_label.toLowerCase().includes('no show')).length;
  const closingFollowUp = deals.filter((d) => d.status_label.toLowerCase().includes('closing') && d.status_label.toLowerCase().includes('follow')).length;
  const closingShowRate = (closingTerminiert + closingNoShow + closingFollowUp) > 0
    ? Math.round(((closingTerminiert + closingFollowUp) / (closingTerminiert + closingNoShow + closingFollowUp)) * 1000) / 10
    : 0;

  const funnel = {
    leads: totalDeals,
    setting_plus: settingPlus,
    closing_plus: closingPlus,
    won: wonCount,
    lost: lostCount,
    verloren: lostCount,
    // Drop-offs
    stuck_in_setting: settingOnly,
    stuck_in_closing: closingOnly,
    dropped_before_closing: totalDeals - closingPlus - lostCount,
    // Rates
    setting_rate: totalDeals > 0 ? Math.round((settingPlus / totalDeals) * 1000) / 10 : 0,
    closing_rate: totalDeals > 0 ? Math.round((closingPlus / totalDeals) * 1000) / 10 : 0,
    win_rate: totalDeals > 0 ? Math.round((wonCount / totalDeals) * 1000) / 10 : 0,
    closing_to_won_rate: closingPlus > 0 ? Math.round((wonCount / closingPlus) * 1000) / 10 : 0,
    setting_to_closing_rate: settingPlus > 0 ? Math.round((closingPlus / settingPlus) * 1000) / 10 : 0,
    drop_rate: totalDeals > 0 ? Math.round((lostCount / totalDeals) * 1000) / 10 : 0,
    // Sub-status breakdown
    setting_terminiert: settingTerminiert,
    setting_no_show: settingNoShow,
    setting_follow_up: settingFollowUp,
    setting_show_rate: settingShowRate,
    closing_terminiert: closingTerminiert,
    closing_no_show: closingNoShow,
    closing_follow_up: closingFollowUp,
    closing_show_rate: closingShowRate,
    status_breakdown: statusBreakdown,
  };

  const costs = {
    per_lead: totalDeals > 0 ? Math.round((spend / totalDeals) * 100) / 100 : 0,
    per_setting: settingPlus > 0 ? Math.round((spend / settingPlus) * 100) / 100 : 0,
    per_closing: closingPlus > 0 ? Math.round((spend / closingPlus) * 100) / 100 : 0,
    per_kunde: wonCount > 0 ? Math.round((spend / wonCount) * 100) / 100 : 0,
    roas_neukunde: spend > 0 ? Math.round((neukundeRevenue / spend) * 100) / 100 : 0,
    roas_total: spend > 0 ? Math.round((totalRevenue / spend) * 100) / 100 : 0,
  };

  const revenue = {
    neukunde: { count: neukundeWon.length, value: neukundeRevenue },
    bestandskunde: { count: bestandskundeWon.length, value: bestandskundeRevenue },
    total: totalRevenue,
  };

  return NextResponse.json({
    range,
    period: { since, until },
    meta,
    funnel,
    costs,
    revenue,
    deals,
  });
}
