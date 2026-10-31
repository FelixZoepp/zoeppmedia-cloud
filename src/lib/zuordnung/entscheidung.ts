/**
 * Entscheidung auf dem Prüfstand (nur Admins): Bewerber an einen gewählten Kunden freigeben oder verwerfen.
 * Freigegebene Bewerber lösen keine Automationen aus (nichts rückwirkend verschicken).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { uebernehmeManatalMatch } from '@/lib/manatal/abgleich';
import { legeFunnelLeadAn, type FunnelLead } from '@/lib/perspective/leads';
import { schliessePruefstand, type PruefstandEintrag } from './pruefstand';

export type Entscheidung = { ok: true; candidateId: string | null } | { ok: false; grund: string };

export async function gibFrei(svc: SupabaseClient, e: PruefstandEintrag, agencyId: string, von: string): Promise<Entscheidung> {
  if (e.status === 'freigegeben' || e.status === 'verworfen') return { ok: false, grund: 'Schon entschieden' };
  const { data: kunde } = await svc.from('agencies').select('id').eq('id', agencyId).maybeSingle();
  if (!kunde) return { ok: false, grund: 'Kunde nicht gefunden' };
  // Atomar beanspruchen: nur eine Freigabe gewinnt (gleichzeitige Einzel-/Sammelfreigabe → keine Dubletten)
  const { data: belegt } = await svc
    .from('bewerber_pruefstand')
    .update({ status: 'freigegeben', ergebnis_agency_id: agencyId, entschieden_von: von, entschieden_am: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', e.id)
    .in('status', ['wartet', 'offen'])
    .select('id');
  if (!((belegt ?? []) as unknown[]).length) return { ok: false, grund: 'Schon entschieden' };
  const r = await uebernimm(svc, e, agencyId, von);
  if (!r.ok) {
    // Zurück auf „offen“, damit der Fall nicht verloren geht
    await svc.from('bewerber_pruefstand').update({ status: 'offen', ergebnis_agency_id: null, entschieden_von: null, entschieden_am: null, gruende: [r.grund] }).eq('id', e.id);
  } else {
    await svc.from('bewerber_pruefstand').update({ ergebnis_candidate_id: r.candidateId }).eq('id', e.id);
  }
  return r;
}

async function uebernimm(svc: SupabaseClient, e: PruefstandEintrag, agencyId: string, von: string): Promise<Entscheidung> {

  if (e.quelle === 'manatal') {
    const matchId = Number(e.externe_ref.replace('manatal:', ''));
    if (!Number.isFinite(matchId)) return { ok: false, grund: 'Ungültige Manatal-Referenz' };
    return uebernehmeManatalMatch(svc, matchId, agencyId, von);
  }

  if (e.quelle === 'perspective') {
    const lead = (e.daten.lead ?? null) as (Omit<FunnelLead, 'automationen'> & { automationen?: boolean }) | null;
    if (!lead) return { ok: false, grund: 'Keine Bewerberdaten gespeichert' };
    const r = await legeFunnelLeadAn(svc, agencyId, {
      ...lead,
      automationen: false,
      nachweis: { quelle: 'perspective_webhook', pruefungen: ['Freigabe durch Admin auf dem Prüfstand'], freigabe_von: von, zeit: new Date().toISOString() },
    });
    if (r.status === 'fehler') return { ok: false, grund: r.fehler };
    await schliessePruefstand(svc, e.externe_ref, { agencyId, candidateId: r.candidateId, von });
    return { ok: true, candidateId: r.candidateId };
  }

  return { ok: false, grund: `Quelle ${e.quelle} kann nicht freigegeben werden` };
}

export async function verwirf(svc: SupabaseClient, e: PruefstandEintrag, von: string): Promise<Entscheidung> {
  if (e.status === 'freigegeben' || e.status === 'verworfen') return { ok: false, grund: 'Schon entschieden' };
  const { error } = await svc
    .from('bewerber_pruefstand')
    .update({ status: 'verworfen', entschieden_von: von, entschieden_am: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', e.id)
    .in('status', ['wartet', 'offen']);
  return error ? { ok: false, grund: error.message } : { ok: true, candidateId: null };
}
