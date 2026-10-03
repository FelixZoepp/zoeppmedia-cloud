import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AD_ASSET_BUCKET } from '@/lib/ads/ads';

/** Signierte Upload-URL: Datei geht direkt aus dem Browser in den Speicher (auch große Videos). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const { filename } = (await req.json().catch(() => ({}))) as { filename?: string };

  const svc = createAdminClient();
  const { data: ad } = await svc.from('ad_items').select('agency_id').eq('id', id).maybeSingle();
  if (!ad) return NextResponse.json({ error: 'Ad nicht gefunden' }, { status: 404 });

  const safe = (filename ?? 'datei').replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);
  const path = `${(ad as { agency_id: string }).agency_id}/${id}/${Date.now()}_${safe}`;
  const { data, error } = await svc.storage.from(AD_ASSET_BUCKET).createSignedUploadUrl(path);
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Upload nicht möglich' }, { status: 500 });
  return NextResponse.json({ path, token: data.token });
}
