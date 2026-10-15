import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { berlinTag, istGueltigerTag } from '@/lib/zeit/berlin';
import { dauerParsen, istTaetigkeit, nachtragStart, type Zeiteintrag } from '@/lib/zeiten/rechnen';
import { EINTRAG_SPALTEN, SCHEMA_FEHLT, tabelleFehlt } from '@/lib/zeiten/server';

type Ctx = { params: Promise<{ id: string }> };

/** Eigener Eintrag (Admins: jeder) oder Fehlerantwort */
async function eintragLaden(id: string) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return { fehler: NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 }) };
  const svc = createAdminClient();
  const { data, error } = await svc.from('zeiteintraege').select(EINTRAG_SPALTEN).eq('id', id).maybeSingle();
  if (error) {
    if (tabelleFehlt(error)) return { fehler: NextResponse.json({ error: SCHEMA_FEHLT }, { status: 503 }) };
    return { fehler: NextResponse.json({ error: error.message }, { status: 500 }) };
  }
  const e = data as Zeiteintrag | null;
  if (!e || (e.user_id !== user.id && user.role !== 'admin')) return { fehler: NextResponse.json({ error: 'Eintrag nicht gefunden' }, { status: 404 }) };
  return { svc, eintrag: e };
}

/**
 * PATCH { agency_id?, taetigkeit?, notiz?, tag?, ab?, dauer? } – Eintrag korrigieren.
 * Mit dauer wird das Ende neu gesetzt (stoppt auch eine laufende Stoppuhr); tag/ab verschieben den Beginn.
 */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const r = await eintragLaden(id);
  if ('fehler' in r) return r.fehler;
  const { svc, eintrag } = r;
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const neu: Record<string, unknown> = {};

  if ('agency_id' in b) neu.agency_id = typeof b.agency_id === 'string' && /^[0-9a-f-]{36}$/i.test(b.agency_id) ? b.agency_id : null;
  if ('taetigkeit' in b) {
    if (!istTaetigkeit(b.taetigkeit)) return NextResponse.json({ error: 'Unbekannte Tätigkeit' }, { status: 400 });
    neu.taetigkeit = b.taetigkeit;
  }
  if ('notiz' in b) neu.notiz = typeof b.notiz === 'string' && b.notiz.trim() ? b.notiz.trim().slice(0, 1000) : null;

  let start = eintrag.start;
  if (typeof b.tag === 'string' || typeof b.ab === 'string') {
    const tag = typeof b.tag === 'string' ? b.tag : berlinTag(new Date(eintrag.start));
    if (!istGueltigerTag(tag) || tag > berlinTag()) return NextResponse.json({ error: 'Bitte ein gültiges Datum angeben' }, { status: 400 });
    const s = nachtragStart(tag, typeof b.ab === 'string' && b.ab ? b.ab : null, []);
    if (!s) return NextResponse.json({ error: 'Uhrzeit bitte als hh:mm angeben' }, { status: 400 });
    start = s;
    neu.start = s;
  }
  if (b.dauer !== undefined && b.dauer !== null && b.dauer !== '') {
    const minuten = dauerParsen(String(b.dauer));
    if (!minuten) return NextResponse.json({ error: 'Dauer bitte als hh:mm angeben (max. 16 Stunden)' }, { status: 400 });
    neu.ende = new Date(new Date(start).getTime() + minuten * 60_000).toISOString();
  } else if (neu.start && eintrag.ende) {
    // Beginn verschoben, Dauer bleibt
    neu.ende = new Date(new Date(start).getTime() + (new Date(eintrag.ende).getTime() - new Date(eintrag.start).getTime())).toISOString();
  }
  if (!Object.keys(neu).length) return NextResponse.json({ ok: true, eintrag });

  const { data, error } = await svc.from('zeiteintraege').update(neu).eq('id', id).select(EINTRAG_SPALTEN).single();
  if (error) {
    if (error.code === '23503') return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 400 });
    if (error.code === '23514') return NextResponse.json({ error: 'Ende liegt vor dem Beginn' }, { status: 400 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, eintrag: data });
}

/** DELETE – Eintrag löschen */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const r = await eintragLaden(id);
  if ('fehler' in r) return r.fehler;
  const { error } = await r.svc.from('zeiteintraege').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
