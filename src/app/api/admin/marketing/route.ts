import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';

const META_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

const CLOSE_PIPELINE_ID = 'pipe_5E14qCHzi8u3cHk0bB44ky';

// Custom field IDs in Close CRM
const LEADQUELLE_FIELD = 'custom.cf_QiH8TTQXCkFg846D3N4qPF6STvbww7q3WJAK3Qja0n8';
const UTM_SOURCE_FIELD = 'custom.cf_HDeEGCeYwUNaYFw1HEYlndsGXBJ8fqcssd1shBPy8xJ';
const UTM_MEDIUM_FIELD = 'custom.cf_YHPoQshsVKzMo15WXQPFdFGBwza89ZQjsLMXz4vgOwE';
const META_SOURCES = ['instagram', 'facebook', 'meta ads', 'meta', 'fb', 'ig', 'paid'];

function closeAuth(): HeadersInit {
  const apiKey = process.env.CLOSE_API_KEY ?? '';
  return {
    Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
    'Content-Type': 'application/json',
  };
}

interface CloseRevenue {
  // Pipeline totals
  total_leads: number;
  setting_count: number;
  closing_count: number;
  won_count: number;
  lost_count: number;
  won_value: number;
  open_value: number;
  // Meta-attributed
  meta_leads: number;
  meta_setting: number;
  meta_closing: number;
  meta_won_count: number;
  meta_won_value: number;
  meta_open_count: number;
  meta_open_value: number;
  // Quoten
  quali_rate: number;   // leads that made it to closing+
  closing_rate: number; // closing that converted to won
  win_rate: number;     // overall won/total
}

async function getCloseRevenue(since?: string, until?: string): Promise<CloseRevenue> {
  const apiKey = process.env.CLOSE_API_KEY;
  const empty: CloseRevenue = {
    total_leads: 0, setting_count: 0, closing_count: 0, won_count: 0, lost_count: 0,
    won_value: 0, open_value: 0,
    meta_leads: 0, meta_setting: 0, meta_closing: 0,
    meta_won_count: 0, meta_won_value: 0, meta_open_count: 0, meta_open_value: 0,
    quali_rate: 0, closing_rate: 0, win_rate: 0,
  };
  if (!apiKey) return empty;

  try {
    // Fetch pipeline statuses to classify stages
    const pipelineRes = await fetch(
      `https://api.close.com/api/v1/pipeline/${CLOSE_PIPELINE_ID}/`,
      { headers: closeAuth() }
    );
    if (!pipelineRes.ok) return empty;
    const pipeline = await pipelineRes.json();
    const statusMap: Record<string, { label: string; type: string }> = {};
    for (const s of pipeline.statuses ?? []) {
      statusMap[s.id] = { label: s.label, type: s.type ?? 'active' };
    }

    // Fetch opportunities, filtered by date if provided
    let oppUrl = `https://api.close.com/api/v1/opportunity/?pipeline_id=${CLOSE_PIPELINE_ID}&_limit=200&_fields=value,status_type,status_id,lead_id,date_created`;
    if (since) oppUrl += `&date_created__gte=${since}`;
    if (until) oppUrl += `&date_created__lte=${until}T23:59:59`;
    const res = await fetch(oppUrl, { headers: closeAuth() });
    if (!res.ok) return empty;
    const data = await res.json();
    const opps: Array<{ value: number; status_type: string; status_id: string; lead_id: string }> =
      data.data ?? [];

    // Fetch unique leads to check attribution
    const uniqueLeadIds = [...new Set(opps.map((o) => o.lead_id))];
    const metaLeadIds = new Set<string>();

    await Promise.all(
      uniqueLeadIds.map(async (leadId) => {
        try {
          const leadRes = await fetch(
            `https://api.close.com/api/v1/lead/${leadId}/?_fields=id,${LEADQUELLE_FIELD},${UTM_SOURCE_FIELD},${UTM_MEDIUM_FIELD}`,
            { headers: closeAuth() }
          );
          if (!leadRes.ok) return;
          const lead = await leadRes.json();
          const leadquelle: string = (lead[LEADQUELLE_FIELD] ?? '').toLowerCase().trim();
          const utmSource: string = (lead[UTM_SOURCE_FIELD] ?? '').toLowerCase().trim();
          const utmMedium: string = (lead[UTM_MEDIUM_FIELD] ?? '').toLowerCase().trim();

          const isMetaByLeadquelle = leadquelle && META_SOURCES.some((s) => leadquelle.includes(s));
          const isMetaByUtm = META_SOURCES.some((s) => utmSource.includes(s)) || utmMedium === 'paid';

          if (isMetaByLeadquelle || isMetaByUtm) {
            metaLeadIds.add(leadId);
          }
        } catch { /* skip */ }
      })
    );

    // Classify each opportunity by funnel stage (mutually exclusive)
    let setting = 0, closing = 0, won = 0, lost = 0;
    let wonValue = 0, openValue = 0;
    let metaSetting = 0, metaClosing = 0;
    let metaWon = 0, metaWonValue = 0, metaOpen = 0, metaOpenValue = 0;

    for (const o of opps) {
      const val = (o.value ?? 0) / 100;
      const statusInfo = statusMap[o.status_id] ?? { label: '', type: 'active' };
      const label = statusInfo.label.toLowerCase();
      const isMeta = metaLeadIds.has(o.lead_id);

      if (statusInfo.type === 'won') {
        won++; wonValue += val;
        if (isMeta) { metaWon++; metaWonValue += val; }
      } else if (statusInfo.type === 'lost') {
        lost++;
      } else if (label.includes('closing') || label.includes('angebot') || label.includes('cc2')) {
        closing++; openValue += val;
        if (isMeta) { metaClosing++; metaOpen++; metaOpenValue += val; }
      } else {
        setting++;
        if (isMeta) { metaSetting++; }
      }
    }

    const totalLeads = opps.length;
    // closing_count = currently in closing + already won (passed through closing)
    const closingPlus = closing + won;
    const metaLeads = metaSetting + metaClosing + metaWon;

    return {
      total_leads: totalLeads,
      setting_count: setting,
      closing_count: closingPlus,
      won_count: won,
      lost_count: lost,
      won_value: wonValue,
      open_value: openValue,
      meta_leads: metaLeads,
      meta_setting: metaSetting,
      meta_closing: metaClosing,
      meta_won_count: metaWon,
      meta_won_value: metaWonValue,
      meta_open_count: metaOpen,
      meta_open_value: metaOpenValue,
      quali_rate: totalLeads > 0 ? Math.round((closingPlus / totalLeads) * 1000) / 10 : 0,
      closing_rate: closingPlus > 0 ? Math.round((won / closingPlus) * 1000) / 10 : 0,
      win_rate: totalLeads > 0 ? Math.round((won / totalLeads) * 1000) / 10 : 0,
    };
  } catch {
    return empty;
  }
}

type Range = 'today' | '7d' | '30d' | 'all';

function getDateRange(range: Range): { since: string; until: string } {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const today = fmt(now);

  if (range === 'today') {
    return { since: today, until: today };
  }

  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const since = new Date(now);
  since.setDate(since.getDate() - days);
  return { since: fmt(since), until: today };
}

function buildInsightFields(): string {
  return [
    'spend',
    'impressions',
    'clicks',
    'cpc',
    'cpm',
    'ctr',
    'actions',
    'cost_per_action_type',
  ].join(',');
}

interface MetaInsight {
  spend?: string;
  impressions?: string;
  clicks?: string;
  cpc?: string;
  cpm?: string;
  ctr?: string;
  actions?: Array<{ action_type: string; value: string }>;
  cost_per_action_type?: Array<{ action_type: string; value: string }>;
}

interface MetaCampaign {
  id: string;
  name: string;
  status: string;
  insights?: { data: MetaInsight[] };
}

interface MetaAdSet {
  id: string;
  name: string;
  campaign_id: string;
  status: string;
  insights?: { data: MetaInsight[] };
}

function extractLeads(insight: MetaInsight): number {
  const actions = insight.actions ?? [];
  const leadAction = actions.find(
    (a) =>
      a.action_type === 'lead' ||
      a.action_type === 'onsite_conversion.lead_grouped'
  );
  return leadAction ? parseFloat(leadAction.value) : 0;
}

function extractCPL(insight: MetaInsight): number {
  const cpa = insight.cost_per_action_type ?? [];
  const leadCPA = cpa.find(
    (a) =>
      a.action_type === 'lead' ||
      a.action_type === 'onsite_conversion.lead_grouped'
  );
  return leadCPA ? parseFloat(leadCPA.value) : 0;
}

function normaliseInsight(insight: MetaInsight) {
  const leads = extractLeads(insight);
  return {
    spend: parseFloat(insight.spend ?? '0'),
    impressions: parseInt(insight.impressions ?? '0', 10),
    clicks: parseInt(insight.clicks ?? '0', 10),
    cpc: parseFloat(insight.cpc ?? '0'),
    cpm: parseFloat(insight.cpm ?? '0'),
    ctr: parseFloat(insight.ctr ?? '0'),
    leads,
    cpl: extractCPL(insight),
  };
}

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();

  const admin = await isAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = request.nextUrl;
  const range = (searchParams.get('range') ?? '30d') as Range;
  const validRanges: Range[] = ['today', '7d', '30d', 'all'];
  if (!validRanges.includes(range)) {
    return NextResponse.json({ error: 'Invalid range' }, { status: 400 });
  }

  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;

  if (!token || !adAccountId) {
    return NextResponse.json(
      { error: 'Meta credentials not configured' },
      { status: 500 }
    );
  }

  const { since, until } = getDateRange(range);
  const timeRange = JSON.stringify({ since, until });
  const insightFields = buildInsightFields();

  // Fetch active campaigns with insights
  const campaignsUrl = new URL(`${BASE_URL}/${adAccountId}/campaigns`);
  campaignsUrl.searchParams.set('access_token', token);
  campaignsUrl.searchParams.set('effective_status', '["ACTIVE"]');
  campaignsUrl.searchParams.set('fields', `id,name,status,insights.time_range(${timeRange}){${insightFields}}`);
  campaignsUrl.searchParams.set('limit', '50');

  const campaignsRes = await fetch(campaignsUrl.toString());

  if (!campaignsRes.ok) {
    const err = await campaignsRes.json();
    return NextResponse.json(
      { error: 'Meta campaigns fetch failed', detail: err },
      { status: 502 }
    );
  }

  const campaignsData = await campaignsRes.json();

  const campaigns: MetaCampaign[] = campaignsData.data ?? [];

  // Fetch ad sets for active campaigns
  let adsets: Array<{
    id: string;
    name: string;
    campaign_id: string;
    campaign_name: string;
    status: string;
    insights: ReturnType<typeof normaliseInsight> | null;
  }> = [];

  if (campaigns.length > 0) {
    const campaignIds = campaigns.map((c) => c.id);

    // Fetch adsets for all active campaigns in parallel
    const adsetResponses = await Promise.all(
      campaignIds.map(async (campaignId) => {
        const url = new URL(`${BASE_URL}/${campaignId}/adsets`);
        url.searchParams.set('access_token', token);
        url.searchParams.set('effective_status', '["ACTIVE","PAUSED"]');
        url.searchParams.set(
          'fields',
          `id,name,campaign_id,status,insights.time_range(${timeRange}){${insightFields}}`
        );
        url.searchParams.set('limit', '100');
        const res = await fetch(url.toString());
        if (!res.ok) return { data: [] };
        const json = await res.json();
        return json;
      })
    );

    const campaignMap = new Map(campaigns.map((c) => [c.id, c.name]));

    adsets = adsetResponses
      .flatMap((r) => (r.data ?? []) as MetaAdSet[])
      .map((adset) => {
        const insightRaw = adset.insights?.data?.[0] ?? null;
        return {
          id: adset.id,
          name: adset.name,
          campaign_id: adset.campaign_id,
          campaign_name: campaignMap.get(adset.campaign_id) ?? '',
          status: adset.status,
          insights: insightRaw ? normaliseInsight(insightRaw) : null,
        };
      });
  }

  // Build campaigns output
  const campaignsOut = campaigns.map((c) => {
    const insightRaw = c.insights?.data?.[0] ?? null;
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      insights: insightRaw ? normaliseInsight(insightRaw) : null,
    };
  });

  // Build summary by aggregating active campaigns only
  let totalSpend = 0;
  let totalLeads = 0;
  let totalImpressions = 0;
  let totalClicks = 0;

  for (const c of campaignsOut) {
    if (c.insights) {
      totalSpend += c.insights.spend;
      totalLeads += c.insights.leads;
      totalImpressions += c.insights.impressions;
      totalClicks += c.insights.clicks;
    }
  }

  // Aggregate CPC from campaigns
  let totalCpc = 0;
  let cpcCount = 0;
  for (const c of campaignsOut) {
    if (c.insights && c.insights.cpc > 0) {
      totalCpc += c.insights.cpc;
      cpcCount++;
    }
  }

  // Fetch Close CRM pipeline data for real leads + ROAS (date-filtered)
  const closeRevenue = await getCloseRevenue(since, until);

  // Use real pipeline leads, not Meta Pixel count
  const realLeads = closeRevenue.total_leads;
  const roas = totalSpend > 0 ? closeRevenue.meta_won_value / totalSpend : 0;

  const summary = {
    spend: totalSpend,
    // Meta Pixel leads (for reference)
    pixel_leads: totalLeads,
    // Real pipeline leads from Close CRM
    leads: realLeads,
    cpl: realLeads > 0 ? totalSpend / realLeads : 0,
    cpc: cpcCount > 0 ? totalCpc / cpcCount : 0,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    impressions: totalImpressions,
    clicks: totalClicks,
    // Pipeline funnel
    setting_count: closeRevenue.setting_count,
    closing_count: closeRevenue.closing_count,
    won_count: closeRevenue.won_count,
    lost_count: closeRevenue.lost_count,
    // Quoten
    quali_rate: closeRevenue.quali_rate,
    closing_rate: closeRevenue.closing_rate,
    win_rate: closeRevenue.win_rate,
    // Revenue — Meta-attributed
    revenue_won: closeRevenue.meta_won_value,
    revenue_open: closeRevenue.meta_open_value,
    deals_won: closeRevenue.meta_won_count,
    deals_open: closeRevenue.meta_open_count,
    // Total pipeline (all sources)
    total_revenue_won: closeRevenue.won_value,
    total_deals_won: closeRevenue.won_count,
    roas,
  };

  return NextResponse.json({
    range,
    period: { since, until },
    summary,
    campaigns: campaignsOut,
    adsets,
  });
}
