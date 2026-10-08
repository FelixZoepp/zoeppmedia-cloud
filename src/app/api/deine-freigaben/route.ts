import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { withPreviewUrls, type AdItem } from '@/lib/ads/ads';
import { variantenMitVorschau, type BildVariante } from '@/lib/ads/bilder';

/** Ads, die auf die Freigabe des Kunden warten (mit KI-Bildvarianten zur Auswahl). */
export async function GET() {
  const user = await getCurrentUser();
  const agencyId = await getEffectiveAgencyId();
  if (!user || !agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  const svc = createAdminClient();
  const { data } = await svc
    .from('ad_items')
    .select('id, titel, idee, typ, asset_path, asset_url, bild_varianten, updated_at')
    .eq('agency_id', agencyId)
    .eq('stage', 'freigabe_kunde')
    .order('updated_at', { ascending: true });
  const rows = (data ?? []) as Array<Pick<AdItem, 'asset_path' | 'asset_url'> & { bild_varianten?: BildVariante[] | null }>;
  const ads = await withPreviewUrls(svc, rows);
  const mitVarianten = await Promise.all(
    ads.map(async ({ bild_varianten, ...a }) => ({ ...a, varianten: await variantenMitVorschau(svc, bild_varianten) })),
  );
  return NextResponse.json({ ads: mitVarianten });
}
