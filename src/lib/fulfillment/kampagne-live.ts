/**
 * „Kampagne live, Baustein X folgt“: z. B. Meta läuft schon, Indeed kommt noch.
 * Alle Aufbau-Schritte außer denen der nachfolgenden Bausteine werden abgehakt, der Kunde geht in die Continuity.
 * Die Schritte der nachfolgenden Bausteine bleiben offen (bzw. werden angelegt) – Kunde sieht sie weiter
 * unter „Deine Aufgaben“ und im Fahrplan („noch im Aufbau“).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { STEPS, type Phase, type StepDef } from './catalog';
import { resolveOwner, startPhase } from './engine';
import { bausteineVon, type Baustein } from './pakete';

const AUFBAU: Phase[] = ['zahlung', 'onboarding', 'setup'];

/** Schritt gehört nur zu Bausteinen, die noch folgen */
export function nurFuerFolgende(def: StepDef, folgt: Baustein[]): boolean {
  return !!def.nur && def.nur.every((b) => folgt.includes(b));
}

function plusTage(base: Date, tage: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

export async function kampagneLive(
  svc: SupabaseClient,
  agencyId: string,
  folgt: Baustein[],
  opts: { userId?: string | null; now?: Date } = {},
): Promise<{ abgehakt: number; offen: string[] }> {
  const now = opts.now ?? new Date();
  const { data: a } = await svc.from('agencies').select('fulfillment_phase, bausteine').eq('id', agencyId).maybeSingle();
  const agency = a as { fulfillment_phase: Phase | null; bausteine: unknown } | null;
  if (!agency?.fulfillment_phase || !AUFBAU.includes(agency.fulfillment_phase)) throw new Error('Kunde ist nicht mehr im Aufbau');
  const bausteine = bausteineVon(agency.bausteine);
  const folgend = folgt.filter((b) => bausteine.includes(b));

  // 1. Offene Aufbau-Schritte abhaken – außer die der folgenden Bausteine
  const { data: rows } = await svc
    .from('client_steps')
    .select('id, step_key, status')
    .eq('agency_id', agencyId)
    .in('phase', AUFBAU)
    .not('status', 'in', '(erledigt,nicht_noetig)');
  const defs = new Map(STEPS.map((d) => [d.key, d]));
  const abhaken = ((rows ?? []) as Array<{ id: string; step_key: string; status: string }>).filter((r) => {
    const d = defs.get(r.step_key);
    return !d || !nurFuerFolgende(d, folgend);
  });
  for (const r of abhaken) {
    await svc
      .from('client_steps')
      .update({ status: 'erledigt', erledigt_am: now.toISOString(), erledigt_von: opts.userId ?? null, kommentar: 'Mit Kampagnenstart abgehakt', updated_at: now.toISOString() })
      .eq('id', r.id);
    await svc.from('client_step_log').insert({ step_id: r.id, agency_id: agencyId, von_status: r.status, nach_status: 'erledigt', kommentar: 'Kampagne live', user_id: opts.userId ?? null });
  }

  // 2. Schritte der folgenden Bausteine sicherstellen (offen, mit frischen Fristen)
  const nachlauf = STEPS.filter((d) => AUFBAU.includes(d.phase) && nurFuerFolgende(d, folgend));
  const neu = [];
  for (const d of nachlauf) {
    neu.push({
      agency_id: agencyId,
      step_key: d.key,
      phase: d.phase,
      wer: d.wer,
      status: 'offen',
      owner_user_id: await resolveOwner(svc, d.funktion),
      faellig_am: plusTage(now, d.phase === 'setup' ? d.frist_tage + 3 : d.frist_tage),
      gestartet_am: now.toISOString(),
    });
  }
  if (neu.length) await svc.from('client_steps').upsert(neu, { onConflict: 'agency_id,step_key', ignoreDuplicates: true });

  // 3. Kampagnenstart merken und Continuity starten
  await svc.from('agencies').update({ launch_datum: now.toISOString().slice(0, 10) }).eq('id', agencyId);
  await startPhase(svc, agencyId, 'continuity', now);
  return { abgehakt: abhaken.length, offen: nachlauf.map((d) => d.titel) };
}
