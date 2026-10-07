import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { freigabeStatus, kiFehlertext, pruefeAd } from '@/lib/ads/ki-pruefung';

export const maxDuration = 120;

/** POST { frames? } – KI-Prüfung einer Ad (Video-Standbilder kommen aus dem Browser) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { frames?: unknown };
  const svc = createAdminClient();
  try {
    const pruefung = await pruefeAd(svc, id, { frames: body.frames });
    const { data } = await svc.from('ad_items').select('*').eq('id', id).maybeSingle();
    return NextResponse.json({ pruefung, ki_status: data ? freigabeStatus(data as never) : 'fehlt' });
  } catch (err) {
    console.error('[ki-pruefung]', err);
    return NextResponse.json({ error: kiFehlertext(err) }, { status: 502 });
  }
}
