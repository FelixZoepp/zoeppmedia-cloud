import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { gibFrei } from '@/lib/zuordnung/entscheidung';
import type { PruefstandEintrag } from '@/lib/zuordnung/pruefstand';

export const maxDuration = 120;

const FELDER = 'id, quelle, externe_ref, agency_vorschlag, name, daten, gruende, status, versuche, created_at, entschieden_am, ergebnis_agency_id';

/** Prüfstand: offene/wartende Bewerber + zuletzt entschiedene, dazu die Kundenliste für die Auswahl */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const svc = createAdminClient();
  const [{ data: offen }, { data: entschieden }, { data: kunden }] = await Promise.all([
    svc.from('bewerber_pruefstand').select(FELDER).in('status', ['offen', 'wartet']).order('created_at', { ascending: false }).limit(300),
    svc.from('bewerber_pruefstand').select(FELDER).in('status', ['freigegeben', 'verworfen']).order('entschieden_am', { ascending: false }).limit(50),
    svc.from('agencies').select('id, name').order('name'),
  ]);
  return NextResponse.json({ offen: offen ?? [], entschieden: entschieden ?? [], kunden: kunden ?? [] });
}

/** Sammel-Freigabe: alle offenen Einträge eines vorgeschlagenen Kunden an genau diesen Kunden */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { agency_id?: string; ids?: string[] };
  if (!b.agency_id || !Array.isArray(b.ids) || !b.ids.length) return NextResponse.json({ error: 'agency_id und ids nötig' }, { status: 400 });
  const svc = createAdminClient();
  const { data } = await svc.from('bewerber_pruefstand').select(FELDER).in('id', b.ids.slice(0, 50)).eq('agency_vorschlag', b.agency_id).in('status', ['offen', 'wartet']);
  const ergebnisse: Array<{ id: string; ok: boolean; grund?: string }> = [];
  for (const e of (data ?? []) as PruefstandEintrag[]) {
    const r = await gibFrei(svc, e, b.agency_id, user.id);
    ergebnisse.push(r.ok ? { id: e.id, ok: true } : { id: e.id, ok: false, grund: r.grund });
  }
  await svc.from('audit_log').insert({ actor_id: user.id, agency_id: b.agency_id, action: 'pruefstand.sammelfreigabe', target: b.agency_id, data: { ergebnisse } }).then(() => {}, () => {});
  return NextResponse.json({ ergebnisse });
}
