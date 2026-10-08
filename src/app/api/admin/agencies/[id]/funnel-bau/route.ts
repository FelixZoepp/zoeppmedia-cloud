import { NextRequest, NextResponse, after } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { istPerspectiveVerbunden } from '@/lib/perspective/oauth';
import { AKTIVE_BAU_STATUS, baueFunnelBisFertig, starteFunnelBau, treibeFunnelBauVoran } from '@/lib/perspective/funnel-bau';

export const maxDuration = 300;

const SPALTEN = 'id, name, perspective_funnel_id, url, editor_url, bau_status, bau_fehler, auto_veroeffentlichen, bau_gestartet_am, updated_at';

async function letzterBau(id: string) {
  const { data } = await createAdminClient()
    .from('perspective_funnels')
    .select(SPALTEN)
    .eq('agency_id', id)
    .not('bau_status', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as { id: string; bau_status: string } | null;
}

/** Stand des automatischen Funnel-Baus; ?weiter=1 treibt einen laufenden Bau einen Schritt weiter. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  let bau = await letzterBau(id);
  if (bau && req.nextUrl.searchParams.get('weiter') === '1' && AKTIVE_BAU_STATUS.includes(bau.bau_status as never)) {
    await treibeFunnelBauVoran(createAdminClient(), bau.id);
    bau = await letzterBau(id);
  }
  return NextResponse.json({ bau, konfiguriert: await istPerspectiveVerbunden(createAdminClient()) });
}

/** aktion: 'start' (Standard) | 'veroeffentlichen' | 'neu_versuchen' */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { aktion?: string; auto_veroeffentlichen?: boolean };
  const svc = createAdminClient();

  if (body.aktion === 'veroeffentlichen' || body.aktion === 'neu_versuchen') {
    const bau = await letzterBau(id);
    if (!bau) return NextResponse.json({ error: 'Kein Funnel-Bau vorhanden' }, { status: 404 });
    if (body.aktion === 'veroeffentlichen') {
      if (bau.bau_status !== 'texte_fertig') return NextResponse.json({ error: 'Funnel ist noch nicht fertig zum Veröffentlichen' }, { status: 409 });
      await svc.from('perspective_funnels').update({ auto_veroeffentlichen: true }).eq('id', bau.id);
    } else {
      if (bau.bau_status !== 'fehler') return NextResponse.json({ error: 'Nur fehlgeschlagene Bauten können neu versucht werden' }, { status: 409 });
      const { data: row } = await svc.from('perspective_funnels').select('perspective_funnel_id').eq('id', bau.id).maybeSingle();
      const naechster = (row as { perspective_funnel_id: string | null } | null)?.perspective_funnel_id ? 'dupliziert' : 'gestartet';
      const { error } = await svc.from('perspective_funnels').update({ bau_status: naechster, bau_fehler: null }).eq('id', bau.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 409 });
    }
    after(() => baueFunnelBisFertig(createAdminClient(), bau.id).then(() => undefined));
    return NextResponse.json({ ok: true, bau: await letzterBau(id) });
  }

  const ergebnis = await starteFunnelBau(svc, id, { autoVeroeffentlichen: body.auto_veroeffentlichen ?? true });
  if (!ergebnis.ok) return NextResponse.json({ error: ergebnis.meldung, grund: ergebnis.grund }, { status: 400 });
  if (ergebnis.neu) after(() => baueFunnelBisFertig(createAdminClient(), ergebnis.funnel.id).then(() => undefined));
  return NextResponse.json({ ok: true, neu: ergebnis.neu, bau: ergebnis.funnel });
}
