/**
 * Absage-Stopp: Alles anhalten, was einen abgesagten Bewerber noch kontaktieren oder anrufen würde.
 * Gemeinsam genutzt von /absagen, beiden Stufen-Routen und der Mehrfachaktion – egal wie der Bewerber
 * nach „Abgesagt“ kommt, es passiert dasselbe:
 *  - Anrufversuche (Kadenz) stoppen
 *  - Gespräche schließen → KI-Agent antwortet nicht mehr
 *  - geplante Jobs (Bot-Timer, Nachfass-WhatsApp, Erinnerungen …) abbrechen
 *  - künftige Termine direkt in der DB absagen
 * Der Bewerber bekommt dabei KEINE Nachricht (keine Mail, keine WhatsApp): Termine werden bewusst nicht über
 * cancelAppointment / Termin-PATCH abgesagt, weil die Mails verschicken bzw. Automationen auslösen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { stopCadence } from '@/lib/cadence/engine';
import {
  anrufSperrgrund,
  endphase,
  istAbgesagtStage,
  istEingestelltStage,
  jobFilterOr,
  sollJobAbbrechen,
  type AbsageBezug,
  type Endphase,
  type Sperrgrund,
} from './schnell-absage';

export { istAbgesagtStage, istEingestelltStage, endphase, anrufSperrgrund };
export type { Endphase, Sperrgrund };

/** Abschluss-Phasen unter den angegebenen Phasen-IDs laden (id → abgesagt/eingestellt) */
export async function ladeEndphasen(db: SupabaseClient, stageIds: Array<string | null | undefined>): Promise<Map<string, Endphase>> {
  const ids = [...new Set(stageIds.filter((x): x is string => !!x))];
  const map = new Map<string, Endphase>();
  // in Blöcken, damit die URL nicht zu lang wird
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await db.from('pipeline_stages').select('id, name, stage_type').in('id', ids.slice(i, i + 200));
    for (const s of (data ?? []) as Array<{ id: string; name: string | null; stage_type: string | null }>) {
      const e = endphase(s);
      if (e) map.set(s.id, e);
    }
  }
  return map;
}

export interface AbsageStoppErgebnis {
  /** Gespräche VOR dem Schließen (für Rückgängig) */
  gespraeche: Array<{ id: string; state: string | null }>;
  /** künftige candidate_appointments, die abgesagt wurden (Status vorher) */
  termine: Array<{ id: string; status: string | null }>;
  /** offene/künftige appointments (Bot-Flow), die abgesagt wurden (Status vorher) */
  einladungen: Array<{ id: string; status: string | null; starts_at: string | null }>;
  gestoppt: { anrufe: boolean; gespraeche: number; jobs: number; termine: number };
}

/**
 * Stoppt alles für einen abgesagten Bewerber. Läuft mit Service-Role → jede Abfrage filtert auf agency_id.
 * Schickt nichts an den Bewerber.
 */
export async function stoppeAbgesagtenBewerber(
  svc: SupabaseClient,
  args: {
    candidateId: string;
    agencyId: string;
    /** Bewerbungs-IDs, falls schon geladen (sonst werden sie nachgeladen) */
    applicationIds?: string[];
    /** cadence_active, falls schon geladen (sonst wird es nachgeladen) */
    cadenceActive?: boolean | null;
    jetzt?: string;
  },
): Promise<AbsageStoppErgebnis> {
  const { candidateId, agencyId } = args;
  const jetzt = args.jetzt ?? new Date().toISOString();

  const [appsRes, candRes, convRes] = await Promise.all([
    args.applicationIds
      ? Promise.resolve({ data: args.applicationIds.map((id) => ({ id })) })
      : svc.from('applications').select('id').eq('candidate_id', candidateId).eq('agency_id', agencyId),
    args.cadenceActive !== undefined
      ? Promise.resolve({ data: { cadence_active: args.cadenceActive } })
      : svc.from('candidates').select('cadence_active').eq('id', candidateId).eq('agency_id', agencyId).maybeSingle(),
    svc.from('conversations').select('id, state').eq('candidate_id', candidateId).eq('agency_id', agencyId),
  ]);
  const applicationIds = ((appsRes.data ?? []) as Array<{ id: string }>).map((a) => a.id);
  const cadenceActive = !!(candRes.data as { cadence_active?: boolean | null } | null)?.cadence_active;
  // Kopien: Vorher-Zustand bleibt für Rückgängig erhalten, auch wenn danach geschlossen wird
  const gespraeche = ((convRes.data ?? []) as Array<{ id: string; state: string | null }>).map((g) => ({ id: g.id, state: g.state }));

  const [{ data: ca }, { data: ap }] = await Promise.all([
    svc
      .from('candidate_appointments')
      .select('id, status')
      .eq('candidate_id', candidateId)
      .eq('agency_id', agencyId)
      .eq('status', 'geplant')
      .gte('scheduled_at', jetzt),
    applicationIds.length
      ? svc
          .from('appointments')
          .select('id, status, starts_at')
          .eq('agency_id', agencyId)
          .in('application_id', applicationIds)
          .in('status', ['proposed', 'booked', 'confirmed'])
      : Promise.resolve({ data: [] }),
  ]);
  const termine = ((ca ?? []) as Array<{ id: string; status: string | null }>).map((t) => ({ id: t.id, status: t.status }));
  // Einladungen ohne Zeit (noch nicht gebucht) oder in der Zukunft
  const einladungen = ((ap ?? []) as Array<{ id: string; status: string | null; starts_at: string | null }>)
    .filter((a) => !a.starts_at || a.starts_at >= jetzt)
    .map((a) => ({ id: a.id, status: a.status, starts_at: a.starts_at }));

  // 1. Anrufversuche stoppen
  if (cadenceActive) await stopCadence(svc, candidateId, 'abgesagt');

  // 2. Gespräche schließen → KI-Agent antwortet nicht mehr
  const offeneGespraeche = gespraeche.filter((g) => g.state !== 'closed').map((g) => g.id);
  if (offeneGespraeche.length) {
    await svc.from('conversations').update({ state: 'closed', updated_at: jetzt }).eq('agency_id', agencyId).in('id', offeneGespraeche);
  }

  // 3. Geplante Jobs abbrechen
  const bezug: AbsageBezug = {
    candidateId,
    conversationIds: gespraeche.map((g) => g.id),
    applicationIds,
    appointmentIds: [...termine.map((t) => t.id), ...einladungen.map((e) => e.id)],
  };
  const { data: jobs } = await svc
    .from('scheduled_jobs')
    .select('id, type, payload')
    .eq('agency_id', agencyId)
    .eq('status', 'pending')
    .or(jobFilterOr(bezug))
    .limit(500);
  const jobIds = ((jobs ?? []) as Array<{ id: string; type: string; payload: unknown }>)
    .filter((j) => sollJobAbbrechen(j, bezug))
    .map((j) => j.id);
  if (jobIds.length) {
    await svc.from('scheduled_jobs').update({ status: 'cancelled', updated_at: jetzt }).eq('agency_id', agencyId).in('id', jobIds).eq('status', 'pending');
  }

  // 4. Künftige Termine direkt absagen – ohne Mail, ohne Automation
  if (termine.length) {
    await svc.from('candidate_appointments').update({ status: 'abgesagt' }).eq('agency_id', agencyId).in('id', termine.map((t) => t.id));
  }
  if (einladungen.length) {
    await svc.from('appointments').update({ status: 'cancelled', updated_at: jetzt }).eq('agency_id', agencyId).in('id', einladungen.map((e) => e.id));
  }

  return {
    gespraeche,
    termine,
    einladungen,
    gestoppt: { anrufe: cadenceActive, gespraeche: offeneGespraeche.length, jobs: jobIds.length, termine: termine.length + einladungen.length },
  };
}
