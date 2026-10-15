import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { berlinMonatsStart, berlinTag, berlinTagesGrenzen, berlinWochenStart, istGueltigerTag } from '@/lib/zeit/berlin';
import { dauerParsen, istMonat, istTaetigkeit, monatsGrenzen, nachtragStart, type Zeiteintrag } from '@/lib/zeiten/rechnen';
import { EINTRAG_SPALTEN, SCHEMA_FEHLT, kundenListe, laufendeStoppuhr, tabelleFehlt } from '@/lib/zeiten/server';

export const dynamic = 'force-dynamic';

const agencyOderNull = (v: unknown): string | null => (typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) ? v : null);
const notizText = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 1000) : null);

/** GET – eigene Einträge (laufende Woche + Monat, wahlweise ?monat=YYYY-MM), laufende Stoppuhr, Kundenliste */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const svc = createAdminClient();
  const jetzt = new Date();
  const monat = req.nextUrl.searchParams.get('monat');
  let ab: string;
  let bis: string | null = null;
  if (monat && istMonat(monat)) {
    ({ ab, bis } = monatsGrenzen(monat));
  } else {
    // Woche kann im Vormonat beginnen
    const w = berlinWochenStart(jetzt);
    const mo = berlinMonatsStart(jetzt);
    ab = (w < mo ? w : mo).toISOString();
  }
  let q = svc.from('zeiteintraege').select(EINTRAG_SPALTEN).eq('user_id', user.id).gte('start', ab).order('start', { ascending: false }).limit(1000);
  if (bis) q = q.lt('start', bis);
  const [{ data, error }, kunden] = await Promise.all([q, kundenListe(svc)]);
  if (error) {
    if (tabelleFehlt(error)) return NextResponse.json({ schema: false, hinweis: SCHEMA_FEHLT, eintraege: [], laufend: null, kunden });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const { eintrag: laufend } = await laufendeStoppuhr(svc, user.id);
  return NextResponse.json({
    schema: true,
    eintraege: (data ?? []) as Zeiteintrag[],
    laufend,
    kunden: kunden.map((k) => ({ id: k.id, name: k.name, beendet: k.phase === 'beendet' })),
    wochenStart: berlinWochenStart(jetzt).toISOString(),
    monatsStart: berlinMonatsStart(jetzt).toISOString(),
    heute: berlinTag(jetzt),
  });
}

/**
 * POST { aktion: 'start', agency_id, taetigkeit, notiz } – Stoppuhr starten (eine laufende wird vorher gestoppt)
 * POST { aktion: 'nachtragen', tag, ab?, dauer, agency_id, taetigkeit, notiz } – Zeit nachtragen
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const taetigkeit = istTaetigkeit(b.taetigkeit) ? b.taetigkeit : null;
  if (!taetigkeit) return NextResponse.json({ error: 'Bitte eine Tätigkeit wählen' }, { status: 400 });
  const svc = createAdminClient();
  const basis = { user_id: user.id, agency_id: agencyOderNull(b.agency_id), taetigkeit, notiz: notizText(b.notiz) };
  const jetzt = new Date();

  if (b.aktion === 'start') {
    const { schema, eintrag } = await laufendeStoppuhr(svc, user.id);
    if (!schema) return NextResponse.json({ error: SCHEMA_FEHLT }, { status: 503 });
    if (eintrag) await svc.from('zeiteintraege').update({ ende: jetzt.toISOString() }).eq('id', eintrag.id).is('ende', null);
    const { data, error } = await svc.from('zeiteintraege').insert({ ...basis, start: jetzt.toISOString() }).select(EINTRAG_SPALTEN).single();
    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'Es läuft schon eine Stoppuhr' }, { status: 409 });
      if (error.code === '23503') return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 400 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, eintrag: data, gestoppt: eintrag?.id ?? null });
  }

  if (b.aktion === 'nachtragen') {
    const tag = typeof b.tag === 'string' ? b.tag : '';
    if (!istGueltigerTag(tag)) return NextResponse.json({ error: 'Bitte ein gültiges Datum angeben' }, { status: 400 });
    if (tag > berlinTag(jetzt)) return NextResponse.json({ error: 'Zeiten in der Zukunft gehen nicht' }, { status: 400 });
    const minuten = dauerParsen(String(b.dauer ?? ''));
    if (!minuten) return NextResponse.json({ error: 'Dauer bitte als hh:mm angeben (max. 16 Stunden)' }, { status: 400 });
    const g = berlinTagesGrenzen(tag, tag);
    const { data: tagesEintraege, error: e1 } = await svc.from('zeiteintraege').select('start, ende').eq('user_id', user.id).gte('start', g.ab).lte('start', g.bis);
    if (e1) {
      if (tabelleFehlt(e1)) return NextResponse.json({ error: SCHEMA_FEHLT }, { status: 503 });
      return NextResponse.json({ error: e1.message }, { status: 500 });
    }
    const start = nachtragStart(tag, typeof b.ab === 'string' ? b.ab : null, (tagesEintraege ?? []) as Array<Pick<Zeiteintrag, 'start' | 'ende'>>);
    if (!start) return NextResponse.json({ error: 'Uhrzeit bitte als hh:mm angeben' }, { status: 400 });
    const ende = new Date(new Date(start).getTime() + minuten * 60_000).toISOString();
    const { data, error } = await svc.from('zeiteintraege').insert({ ...basis, start, ende }).select(EINTRAG_SPALTEN).single();
    if (error) {
      if (error.code === '23503') return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 400 });
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, eintrag: data });
  }

  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
}
