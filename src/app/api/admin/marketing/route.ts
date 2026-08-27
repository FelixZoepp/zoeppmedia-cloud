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

async function getCloseRevenue(): Promise<{ won: number; open: number; won_count: number; open_count: number; meta_won: number; meta_open: number; meta_won_count: number; meta_open_count: number }> {
  const apiKey = process.env.CLOSE_API_KEY;
  const empty = { won: 0, open: 0, won_count: 0, open_count: 0, meta_won: 0, meta_open: 0, meta_won_count: 0, meta_open_count: 0 };
  if (!apiKey) return empty;

  try {
    // Fetch opportunities with lead_id
    const res = await fetch(
      `https://api.close.com/api/v1/opportunity/?pipeline_id=${CLOSE_PIPELINE_ID}&_limit=200&_fields=value,status_type,pipeline_id,lead_id`,
      { headers: closeAuth() }
    );
    if (!res.ok) return empty;
    const data = await res.json();
    // Close API already filters by pipeline_id server-side
    const opps: Array<{ value: number; status_type: string; pipeline_id?: string; lead_id: string }> =
      data.data ?? [];

    // Fetch unique leads to check Leadquelle
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

          // Check Leadquelle field OR utm_source/utm_medium for Meta attribution
          const isMetaByLeadquelle = leadquelle && META_SOURCES.some((s) => leadquelle.includes(s));
          const isMetaByUtm = META_SOURCES.some((s) => utmSource.includes(s)) || utmMedium === 'paid';

          if (isMetaByLeadquelle || isMetaByUtm) {
            metaLeadIds.add(leadId);
          }
        } catch { /* skip */ }
      })
    );

    let won = 0, open = 0, won_count = 0, open_count = 0;
    let meta_won = 0, meta_open = 0, meta_won_count = 0, meta_open_count = 0;

    for (const o of opps) {
      const val = (o.value ?? 0) / 100;
      const isMeta = metaLeadIds.has(o.lead_id);

      if (o.status_type === 'won') {
        won += val; won_count++;
        if (isMeta) { meta_won += val; meta_won_count++; }
      }
      if (o.status_type === 'active') {
        open += val; open_count++;
        if (isMeta) { meta_open += val; meta_open_count++; }
      }
    }
    return { won, open, won_count, open_count, meta_won, meta_open, meta_won_count, meta_open_count };
  } catch {
    return { won: 0, open: 0, won_count: 0, open_count: 0, meta_won: 0, meta_open: 0, meta_won_count: 0, meta_open_count: 0 };
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

  // Fetch Close CRM revenue for ROAS (only Meta Ads attributed deals)
  const closeRevenue = await getCloseRevenue();
  const roas = totalSpend > 0 ? closeRevenue.meta_won / totalSpend : 0;

  const summary = {
    spend: totalSpend,
    leads: totalLeads,
    cpl: totalLeads > 0 ? totalSpend / totalLeads : 0,
    cpc: cpcCount > 0 ? totalCpc / cpcCount : 0,
    ctr: totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0,
    impressions: totalImpressions,
    clicks: totalClicks,
    // Close CRM revenue — only from leads with Leadquelle = Meta/Instagram/Facebook
    revenue_won: closeRevenue.meta_won,
    revenue_open: closeRevenue.meta_open,
    deals_won: closeRevenue.meta_won_count,
    deals_open: closeRevenue.meta_open_count,
    // Total pipeline (all sources)
    total_revenue_won: closeRevenue.won,
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
