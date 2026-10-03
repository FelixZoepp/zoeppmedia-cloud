import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { AD_TYPEN, withPreviewUrls, type AdItem } from '@/lib/ads/ads';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { signalSafe } from '@/lib/fulfillment/engine';

/** Ads-Board: alle Ads (ohne Verworfene/alte Live-Ads), plus Kunden und Team für Formulare. */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const svc = createAdminClient();
  const agencyId = req.nextUrl.searchParams.get('agency_id');

  let q = svc.from('ad_items').select('*').neq('stage', 'verworfen').order('updated_at', { ascending: false });
  if (agencyId) q = q.eq('agency_id', agencyId);
  const [{ data: ads }, { data: agencies }, { data: team }] = await Promise.all([
    q,
    svc.from('agencies').select('id, name').not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`).order('name'),
    svc.from('users').select('id, name').in('role', ['admin', 'employee']),
  ]);

  const names = new Map(((agencies ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name]));
  const people = new Map(((team ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name]));
  // Live-Ads nur die letzten 30 Tage auf dem Board
  const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const list = ((ads ?? []) as AdItem[]).filter((a) => a.stage !== 'live' || (a.live_am ?? a.updated_at) > cutoff);

  return NextResponse.json({
    ads: (await withPreviewUrls(svc, list)).map((a) => ({
      ...a,
      agency_name: names.get(a.agency_id) ?? '–',
      assignee_name: a.assignee_id ? people.get(a.assignee_id) ?? null : null,
    })),
    agencies: agencies ?? [],
    team: team ?? [],
  });
}

export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as Record<string, string | null>;
  if (!body.agency_id || !body.titel?.trim()) return NextResponse.json({ error: 'Kunde und Titel sind Pflicht' }, { status: 400 });

  const svc = createAdminClient();
  const { data, error } = await svc
    .from('ad_items')
    .insert({
      agency_id: body.agency_id,
      titel: body.titel.trim().slice(0, 200),
      idee: body.idee?.slice(0, 4000) || null,
      typ: AD_TYPEN.some((t) => t.key === body.typ) ? body.typ : 'grafik',
      assignee_id: body.assignee_id || null,
      faellig_am: body.faellig_am || null,
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  // Fulfillment v2: erste Ad-Idee angelegt → Setup-Schritt "Ad-Ideen angelegt" erledigt
  await signalSafe(svc, body.agency_id, 'ad_ideen_angelegt');
  return NextResponse.json({ id: (data as { id: string }).id });
}
