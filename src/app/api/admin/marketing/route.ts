import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';

const META_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

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

  // Fetch account-level insights
  const accountInsightsUrl = new URL(`${BASE_URL}/${adAccountId}/insights`);
  accountInsightsUrl.searchParams.set('access_token', token);
  accountInsightsUrl.searchParams.set('fields', insightFields);
  accountInsightsUrl.searchParams.set('time_range', timeRange);
  accountInsightsUrl.searchParams.set('level', 'account');

  const [campaignsRes, accountInsightsRes] = await Promise.all([
    fetch(campaignsUrl.toString()),
    fetch(accountInsightsUrl.toString()),
  ]);

  if (!campaignsRes.ok) {
    const err = await campaignsRes.json();
    return NextResponse.json(
      { error: 'Meta campaigns fetch failed', detail: err },
      { status: 502 }
    );
  }

  const campaignsData = await campaignsRes.json();
  const accountInsightsData = await accountInsightsRes.json();

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

  // Build summary from account-level insights
  const accountInsight: MetaInsight = accountInsightsData.data?.[0] ?? {};
  const summaryNorm = normaliseInsight(accountInsight);

  const summary = {
    spend: summaryNorm.spend,
    leads: summaryNorm.leads,
    cpl: summaryNorm.cpl,
    ctr: summaryNorm.ctr,
    impressions: summaryNorm.impressions,
    clicks: summaryNorm.clicks,
  };

  return NextResponse.json({
    range,
    period: { since, until },
    summary,
    campaigns: campaignsOut,
    adsets,
  });
}
