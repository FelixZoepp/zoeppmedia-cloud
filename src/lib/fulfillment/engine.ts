/**
 * Fulfillment v2 — Ablauf-Logik:
 * Phase starten (Schritte anlegen), Status ändern (mit Verlauf), automatisch
 * weiterschieben, wenn eine Phase fertig ist, und Auto-Signale abhaken.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  STEP_BY_KEY,
  nextPhase,
  stepsForPhase,
  mapLegacyPhase,
  type AutoSignal,
  type Funktion,
  type Phase,
  type StepDef,
} from './catalog';

export type StepStatus = 'offen' | 'in_arbeit' | 'zur_pruefung' | 'erledigt' | 'nicht_noetig';

const DONE: StepStatus[] = ['erledigt', 'nicht_noetig'];

export interface ClientStepRow {
  id: string;
  agency_id: string;
  step_key: string;
  phase: Phase;
  wer: 'kunde' | 'zoepp';
  status: StepStatus;
  owner_user_id: string | null;
  faellig_am: string | null;
  gestartet_am: string;
  erledigt_am: string | null;
  kommentar: string | null;
}

function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime());
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Interne Person für eine Funktion (Nils = media_buyer, Petra = backoffice, Felix = csm). Fallback: erster Admin. */
export async function resolveOwner(svc: SupabaseClient, funktion: Funktion): Promise<string | null> {
  const { data: byFunktion } = await svc
    .from('users')
    .select('id')
    .in('role', ['admin', 'employee'])
    .eq('funktion', funktion)
    .neq('aktiv', false)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (byFunktion) return (byFunktion as { id: string }).id;

  const { data: admin } = await svc
    .from('users')
    .select('id')
    .eq('role', 'admin')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  return (admin as { id: string } | null)?.id ?? null;
}

/**
 * Phase starten: Kunde auf die Phase setzen und deren Schritte anlegen.
 * Fristen zählen ab jetzt, in der Continuity ab Kampagnenstart (launch_datum).
 */
export async function startPhase(
  svc: SupabaseClient,
  agencyId: string,
  phase: Phase,
  now: Date = new Date(),
): Promise<void> {
  const update: Record<string, unknown> = { fulfillment_phase: phase, fulfillment_phase_seit: now.toISOString() };
  let base = now;
  if (phase === 'continuity') {
    const { data: a } = await svc.from('agencies').select('launch_datum').eq('id', agencyId).maybeSingle();
    const launch = (a as { launch_datum: string | null } | null)?.launch_datum;
    if (launch) base = new Date(`${launch}T00:00:00Z`);
    else update.launch_datum = now.toISOString().slice(0, 10);
  }
  await svc.from('agencies').update(update).eq('id', agencyId);

  const defs = stepsForPhase(phase);
  const owners = new Map<Funktion, string | null>();
  for (const f of new Set(defs.map((d) => d.funktion))) owners.set(f, await resolveOwner(svc, f));

  const rows = defs.map((d) => ({
    agency_id: agencyId,
    step_key: d.key,
    phase: d.phase,
    wer: d.wer,
    status: 'offen',
    owner_user_id: owners.get(d.funktion) ?? null,
    faellig_am: addDays(base, d.frist_tage),
    gestartet_am: now.toISOString(),
  }));
  if (rows.length) {
    await svc.from('client_steps').upsert(rows, { onConflict: 'agency_id,step_key', ignoreDuplicates: true });
  }

  // Schritte, deren Signal schon erfüllt ist, sofort abhaken (z.B. Kunde war schon eingeloggt)
  await applySatisfiedSignals(svc, agencyId, defs);
}

/** Status eines Schritts ändern, Verlauf schreiben und ggf. die Phase weiterschieben. */
export async function setStepStatus(
  svc: SupabaseClient,
  stepId: string,
  status: StepStatus,
  opts: { userId?: string | null; kommentar?: string | null; now?: Date } = {},
): Promise<{ advancedTo: Phase | null }> {
  const now = opts.now ?? new Date();
  const { data: s } = await svc.from('client_steps').select('*').eq('id', stepId).maybeSingle();
  const step = s as ClientStepRow | null;
  if (!step) throw new Error('Schritt nicht gefunden');
  if (step.status === status && !opts.kommentar) return { advancedTo: null };

  await svc
    .from('client_steps')
    .update({
      status,
      erledigt_am: DONE.includes(status) ? now.toISOString() : null,
      erledigt_von: DONE.includes(status) ? opts.userId ?? null : null,
      kommentar: opts.kommentar ?? step.kommentar,
      updated_at: now.toISOString(),
    })
    .eq('id', stepId);

  await svc.from('client_step_log').insert({
    step_id: stepId,
    agency_id: step.agency_id,
    von_status: step.status,
    nach_status: status,
    kommentar: opts.kommentar ?? null,
    user_id: opts.userId ?? null,
  });

  if (!DONE.includes(status)) return { advancedTo: null };

  // Kampagne live → Kampagnenstart merken (Basis der Continuity-Checks)
  if (step.step_key === 's_launch') {
    await svc.from('agencies').update({ launch_datum: now.toISOString().slice(0, 10) }).eq('id', step.agency_id);
  }
  return { advancedTo: await advanceIfPhaseDone(svc, step.agency_id, now) };
}

/** Kunden-Schritt vom Kunden erledigt: mit Prüfung → "zur_pruefung", sonst direkt erledigt. */
export async function completeCustomerStep(
  svc: SupabaseClient,
  stepId: string,
  userId: string,
  kommentar?: string | null,
): Promise<StepStatus> {
  const { data: s } = await svc.from('client_steps').select('step_key, wer').eq('id', stepId).maybeSingle();
  const step = s as { step_key: string; wer: string } | null;
  if (!step || step.wer !== 'kunde') throw new Error('Kein Kunden-Schritt');
  const def = STEP_BY_KEY.get(step.step_key);
  const status: StepStatus = def?.pruefen ? 'zur_pruefung' : 'erledigt';
  await setStepStatus(svc, stepId, status, { userId, kommentar: kommentar ?? null });
  return status;
}

/** Sind alle Schritte der aktuellen Phase erledigt? Dann nächste Phase starten. */
export async function advanceIfPhaseDone(svc: SupabaseClient, agencyId: string, now: Date = new Date()): Promise<Phase | null> {
  const { data: a } = await svc.from('agencies').select('fulfillment_phase').eq('id', agencyId).maybeSingle();
  const phase = (a as { fulfillment_phase: Phase | null } | null)?.fulfillment_phase;
  if (!phase) return null;
  const next = nextPhase(phase);
  if (!next) return null;

  const { data: steps } = await svc.from('client_steps').select('status').eq('agency_id', agencyId).eq('phase', phase);
  const list = (steps ?? []) as Array<{ status: StepStatus }>;
  if (!list.length || list.some((x) => !DONE.includes(x.status))) return null;

  if (next === 'beendet') {
    await svc.from('agencies').update({ fulfillment_phase: 'beendet', fulfillment_phase_seit: now.toISOString() }).eq('id', agencyId);
    return 'beendet';
  }
  await startPhase(svc, agencyId, next, now);
  return next;
}

// ---------------------------------------------------------------------------
// Auto-Signale
// ---------------------------------------------------------------------------

/** Signal eingetreten (z.B. Transkript hochgeladen) → passenden offenen Schritt abhaken. */
export async function completeBySignal(svc: SupabaseClient, agencyId: string, signal: AutoSignal): Promise<boolean> {
  const keys = [...STEP_BY_KEY.values()].filter((d) => d.auto === signal).map((d) => d.key);
  if (!keys.length) return false;
  const { data } = await svc
    .from('client_steps')
    .select('id, status')
    .eq('agency_id', agencyId)
    .in('step_key', keys)
    .not('status', 'in', '(erledigt,nicht_noetig)');
  const open = (data ?? []) as Array<{ id: string }>;
  for (const row of open) await setStepStatus(svc, row.id, 'erledigt', { kommentar: 'automatisch erkannt' });
  return open.length > 0;
}

/** Prüft beim Phasenstart, welche Signale schon erfüllt sind. */
async function applySatisfiedSignals(svc: SupabaseClient, agencyId: string, defs: StepDef[]): Promise<void> {
  const signals = new Set(defs.map((d) => d.auto).filter((x): x is AutoSignal => !!x));
  for (const signal of signals) {
    if (await isSignalSatisfied(svc, agencyId, signal)) await completeBySignal(svc, agencyId, signal);
  }
}

export async function isSignalSatisfied(svc: SupabaseClient, agencyId: string, signal: AutoSignal): Promise<boolean> {
  switch (signal) {
    case 'kunde_eingeloggt': {
      const { data } = await svc.from('users').select('id').eq('agency_id', agencyId).not('last_login', 'is', null).limit(1).maybeSingle();
      return !!data;
    }
    case 'onboarding_formular': {
      const { data } = await svc.from('agencies').select('onboarding_completed').eq('id', agencyId).maybeSingle();
      return !!(data as { onboarding_completed?: boolean } | null)?.onboarding_completed;
    }
    case 'whatsapp_verbunden': {
      const { data } = await svc.from('whatsapp_accounts').select('id').eq('agency_id', agencyId).eq('status', 'connected').limit(1).maybeSingle();
      return !!data;
    }
    case 'transkript_hochgeladen': {
      const { data } = await svc.from('transcripts').select('id').eq('agency_id', agencyId).limit(1).maybeSingle();
      return !!data;
    }
    case 'kickoff_gebucht':
      return false; // kommt nur live über den Calendly-Webhook
  }
}

// ---------------------------------------------------------------------------
// Bestandskunden übernehmen
// ---------------------------------------------------------------------------

/** Kunde ohne neue Phase: aus der alten Pipeline-Phase übernehmen und Schritte anlegen. */
export async function ensureFulfillment(svc: SupabaseClient, agencyId: string, now: Date = new Date()): Promise<Phase> {
  const { data: a } = await svc
    .from('agencies')
    .select('fulfillment_phase, phase_override, onboarding_completed')
    .eq('id', agencyId)
    .maybeSingle();
  const agency = a as { fulfillment_phase: Phase | null; phase_override: string | null; onboarding_completed: boolean } | null;
  if (!agency) throw new Error('Kunde nicht gefunden');
  if (agency.fulfillment_phase) return agency.fulfillment_phase;
  const phase = mapLegacyPhase(agency.phase_override, agency.onboarding_completed);
  await startPhase(svc, agencyId, phase, now);
  return phase;
}

/** Signal aus anderen Abläufen melden — Fehler dürfen den Hauptablauf nie stören. */
export async function signalSafe(svc: SupabaseClient, agencyId: string | null | undefined, signal: AutoSignal): Promise<void> {
  if (!agencyId) return;
  await completeBySignal(svc, agencyId, signal).catch((err) =>
    console.error(`[fulfillment] Signal ${signal} für ${agencyId} fehlgeschlagen:`, err),
  );
}

/**
 * Neue Person mit Funktion (z.B. Nils = media_buyer) → alle offenen Schritte dieser Funktion
 * übernehmen, die bisher vertretungsweise bei jemand anderem lagen.
 */
export async function reassignOpenStepsToFunktion(svc: SupabaseClient, userId: string, funktion: Funktion): Promise<number> {
  const keys = [...STEP_BY_KEY.values()].filter((d) => d.funktion === funktion).map((d) => d.key);
  if (!keys.length) return 0;
  const { data } = await svc
    .from('client_steps')
    .update({ owner_user_id: userId, updated_at: new Date().toISOString() })
    .in('step_key', keys)
    .not('status', 'in', '(erledigt,nicht_noetig)')
    .select('id');
  return ((data ?? []) as unknown[]).length;
}
