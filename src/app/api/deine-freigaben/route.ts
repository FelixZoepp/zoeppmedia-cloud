import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { withPreviewUrls, type AdItem } from '@/lib/ads/ads';

/** Ads, die auf die Freigabe des Kunden warten. */
export async function GET() {
  const user = await getCurrentUser();
  const agencyId = await getEffectiveAgencyId();
  if (!user || !agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  const svc = createAdminClient();
  const { data } = await svc
    .from('ad_items')
    .select('id, titel, idee, typ, asset_path, asset_url, updated_at')
    .eq('agency_id', agencyId)
    .eq('stage', 'freigabe_kunde')
    .order('updated_at', { ascending: true });
  return NextResponse.json({ ads: await withPreviewUrls(svc, (data ?? []) as Pick<AdItem, 'asset_path' | 'asset_url'>[]) });
}
