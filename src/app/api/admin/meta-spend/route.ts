import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';

const META_API_VERSION = 'v21.0';
const BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const admin = await isAdmin(supabase);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!token || !adAccountId) {
    return NextResponse.json({ error: 'Meta credentials not configured' }, { status: 500 });
  }

  const url = new URL(req.url);
  const since = url.searchParams.get('since') ?? '2026-08-03';
  const until = url.searchParams.get('until') ?? '2026-08-23';

  const timeRange = JSON.stringify({ since, until });
  const fields = 'spend,impressions,clicks,cpc,ctr,actions,cost_per_action_type';

  // Account-level insights
  const accountUrl = `${BASE_URL}/${adAccountId}/insights?access_token=${token}&time_range=${timeRange}&fields=${fields}&level=account`;
  const accountRes = await fetch(accountUrl);
  const accountData = await accountRes.json();

  // Campaign-level insights
  const campaignUrl = `${BASE_URL}/${adAccountId}/insights?access_token=${token}&time_range=${timeRange}&fields=${fields},campaign_id,campaign_name&level=campaign&limit=50`;
  const campaignRes = await fetch(campaignUrl);
  const campaignData = await campaignRes.json();

  // Ad-level insights for utm_content breakdown
  const adFields = 'spend,impressions,clicks,actions,cost_per_action_type,ad_name,adset_name';
  const adUrl = `${BASE_URL}/${adAccountId}/insights?access_token=${token}&time_range=${timeRange}&fields=${adFields}&level=ad&limit=100`;
  const adRes = await fetch(adUrl);
  const adData = await adRes.json();

  return NextResponse.json({ account: accountData, campaigns: campaignData, ads: adData });
}
