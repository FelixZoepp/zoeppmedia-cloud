const META_API_VERSION = 'v21.0';
const META_BASE = `https://graph.facebook.com/${META_API_VERSION}`;

function getAccessToken(): string {
  const token = process.env.META_SYSTEM_USER_TOKEN;
  if (!token) throw new Error('META_SYSTEM_USER_TOKEN not configured');
  return token;
}

async function metaFetch(
  path: string,
  options?: RequestInit & { params?: Record<string, string> }
) {
  const url = new URL(`${META_BASE}${path}`);
  url.searchParams.set('access_token', getAccessToken());
  if (options?.params) {
    for (const [k, v] of Object.entries(options.params)) {
      url.searchParams.set(k, v);
    }
  }

  const { params: _params, ...fetchOptions } = options || {};
  const res = await fetch(url.toString(), {
    ...fetchOptions,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });

  const data = await res.json();
  if (data.error) throw new Error(`Meta API: ${data.error.message}`);
  return data;
}

export interface AdCreativeInput {
  name: string;
  pageId: string;
  imageUrl?: string;
  imageHash?: string;
  headline: string;
  body: string;
  description?: string;
  linkUrl: string;
  ctaType?: string;
}

export async function uploadImage(adAccountId: string, imageUrl: string): Promise<string> {
  const data = await metaFetch(`/act_${adAccountId}/adimages`, {
    method: 'POST',
    body: JSON.stringify({ url: imageUrl }),
  });
  // Returns { images: { <filename>: { hash: "...", ... } } }
  const images = data.images as Record<string, { hash: string }>;
  const firstKey = Object.keys(images)[0];
  return images[firstKey].hash;
}

export async function createAdCreative(
  adAccountId: string,
  input: AdCreativeInput
): Promise<string> {
  const objectStorySpec: Record<string, unknown> = {
    page_id: input.pageId,
    link_data: {
      message: input.body,
      link: input.linkUrl,
      name: input.headline,
      description: input.description || '',
      call_to_action: { type: input.ctaType || 'APPLY_NOW' },
      ...(input.imageHash ? { image_hash: input.imageHash } : {}),
    },
  };

  const data = await metaFetch(`/act_${adAccountId}/adcreatives`, {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      object_story_spec: objectStorySpec,
    }),
  });
  return data.id as string;
}

export async function createAd(
  adAccountId: string,
  adSetId: string,
  creativeId: string,
  name: string
): Promise<string> {
  const data = await metaFetch(`/act_${adAccountId}/ads`, {
    method: 'POST',
    body: JSON.stringify({
      name,
      adset_id: adSetId,
      creative: { creative_id: creativeId },
      status: 'PAUSED',
    }),
  });
  return data.id as string;
}

export async function publishAd(adId: string): Promise<void> {
  await metaFetch(`/${adId}`, {
    method: 'POST',
    body: JSON.stringify({ status: 'ACTIVE' }),
  });
}

export interface InsightRow {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number;
  ctr: number;
}

export async function fetchInsights(
  adAccountId: string,
  since: string,
  until: string
): Promise<InsightRow[]> {
  const data = await metaFetch(`/act_${adAccountId}/insights`, {
    params: {
      fields: 'spend,impressions,clicks,actions',
      time_range: JSON.stringify({ since, until }),
      time_increment: '1',
      level: 'account',
    },
  });

  return ((data.data as Record<string, unknown>[]) || []).map((row) => {
    const actions = (row.actions as { action_type: string; value: string }[]) || [];
    const leadAction = actions.find((a) => a.action_type === 'lead');
    const leads = leadAction ? parseInt(leadAction.value, 10) : 0;
    const spend = parseFloat(row.spend as string) || 0;
    const impressions = parseInt(row.impressions as string, 10) || 0;
    const clicks = parseInt(row.clicks as string, 10) || 0;

    return {
      date: row.date_start as string,
      spend,
      impressions,
      clicks,
      leads,
      cpl: leads > 0 ? spend / leads : 0,
      ctr: impressions > 0 ? (clicks / impressions) * 100 : 0,
    };
  });
}
