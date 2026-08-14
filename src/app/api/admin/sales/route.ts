import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';

const PIPELINE_ID = 'pipe_5E14qCHzi8u3cHk0bB44ky';
const CLOSE_BASE = 'https://api.close.com/api/v1';

function closeHeaders(): HeadersInit {
  const apiKey = process.env.CLOSE_API_KEY ?? '';
  const encoded = Buffer.from(apiKey + ':').toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    'Content-Type': 'application/json',
  };
}

async function closeGet(path: string) {
  const res = await fetch(`${CLOSE_BASE}${path}`, { headers: closeHeaders() });
  if (!res.ok) throw new Error(`Close API error ${res.status}: ${path}`);
  return res.json();
}

function getDateFilter(range: string): { since: string | null; until: string | null } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = fmt(now);

  switch (range) {
    case 'today':
      return { since: today, until: today };
    case 'week': {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - now.getDay() + 1); // Monday
      return { since: fmt(weekStart), until: today };
    }
    case 'month': {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return { since: fmt(monthStart), until: today };
    }
    default: // 'all'
      return { since: null, until: null };
  }
}

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const admin = await isAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const range = url.searchParams.get('range') ?? 'all';
  const { since, until } = getDateFilter(range);

  // 1. Fetch pipeline to get status labels
  const pipeline = await closeGet(`/pipeline/${PIPELINE_ID}/`);
  const statusMap: Record<string, { label: string; type: string }> = {};
  for (const s of pipeline.statuses ?? []) {
    statusMap[s.id] = { label: s.label, type: s.type ?? 'active' };
  }

  // 2. Fetch all opportunities in pipeline (up to 200)
  let oppPath = `/opportunity/?pipeline_id=${PIPELINE_ID}&_limit=200&_order_by=-date_updated`;
  if (since) oppPath += `&date_created__gte=${since}`;
  if (until) oppPath += `&date_created__lte=${until}T23:59:59`;
  const oppData = await closeGet(oppPath);
  // Double-filter: only keep opportunities that belong to the D2D pipeline
  const opportunities: Array<{
    id: string;
    lead_id: string;
    pipeline_id: string;
    status_id: string;
    status_label: string;
    status_type: string;
    value: number;
    confidence: number;
    note: string;
    date_created: string;
    date_updated: string;
    contact_name: string;
    lead_name: string;
  }> = (oppData.data ?? []).filter(
    (o: { pipeline_id?: string }) => o.pipeline_id === PIPELINE_ID
  );

  // 3. Fetch lead names for unique lead_ids
  const uniqueLeadIds = [...new Set(opportunities.map((o: { lead_id: string }) => o.lead_id))];
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

  // 4. Build enriched deals array
  const deals = opportunities.map((opp) => {
    const statusInfo = statusMap[opp.status_id] ?? { label: opp.status_label ?? 'Unbekannt', type: 'active' };
    return {
      id: opp.id,
      lead_id: opp.lead_id,
      lead_name: leadNames[opp.lead_id] ?? opp.lead_name ?? opp.lead_id,
      status_id: opp.status_id,
      status_label: statusInfo.label,
      status_type: statusInfo.type,
      // Close stores value in cents
      value: (opp.value ?? 0) / 100,
      confidence: opp.confidence ?? 0,
      note: opp.note ?? '',
      date_created: opp.date_created,
      date_updated: opp.date_updated,
    };
  });

  // 5. Compute summary
  const wonDeals = deals.filter((d) => d.status_type === 'won');
  const lostDeals = deals.filter((d) => d.status_type === 'lost');
  const activeDeals = deals.filter((d) => d.status_type === 'active');

  const totalValue = deals.reduce((sum, d) => sum + d.value, 0);
  const wonValue = wonDeals.reduce((sum, d) => sum + d.value, 0);
  const lostValue = lostDeals.reduce((sum, d) => sum + d.value, 0);
  const openValue = activeDeals.reduce((sum, d) => sum + d.value, 0);

  const wonCount = wonDeals.length;
  const lostCount = lostDeals.length;
  const winRate = wonCount + lostCount > 0 ? (wonCount / (wonCount + lostCount)) * 100 : 0;

  // 6. Build statuses breakdown
  const statusBreakdown: Record<string, { label: string; type: string; count: number; total_value: number }> = {};
  for (const [id, info] of Object.entries(statusMap)) {
    statusBreakdown[id] = { label: info.label, type: info.type, count: 0, total_value: 0 };
  }
  for (const deal of deals) {
    if (!statusBreakdown[deal.status_id]) {
      statusBreakdown[deal.status_id] = {
        label: deal.status_label,
        type: deal.status_type,
        count: 0,
        total_value: 0,
      };
    }
    statusBreakdown[deal.status_id].count += 1;
    statusBreakdown[deal.status_id].total_value += deal.value;
  }

  const statuses = Object.entries(statusBreakdown)
    .map(([id, s]) => ({ id, ...s }))
    .filter((s) => s.count > 0 || Object.keys(statusMap).includes(s.id));

  return NextResponse.json({
    range,
    period: since && until ? { since, until } : null,
    summary: {
      total_deals: deals.length,
      open_deals: activeDeals.length,
      total_value: totalValue,
      won_value: wonValue,
      open_value: openValue,
      lost_value: lostValue,
      win_rate: Math.round(winRate * 10) / 10,
    },
    statuses,
    deals,
  });
}
