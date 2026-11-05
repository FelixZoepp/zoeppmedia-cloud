/**
 * Neue Bewerbung → Hiring Lisa (POST /api/v1/applicants). Lisa ruft innerhalb von 60 Sekunden an.
 * external_id = applications.id (Idempotenz: doppeltes Senden ruft nicht doppelt an).
 * Schickt selbst nichts an den Bewerber – den Anruf macht Lisa nur mit Einwilligung (consents.call).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { insertDeduped } from '@/lib/jobs/insert-deduped';
import { logActivity } from '@/lib/activity/log';
import { aktiverLisaZugang, type LisaZugang } from './verbindung';
import { lisaQuelle } from './protokoll';

export type SendeErgebnis = 'gesendet' | 'schon_gesendet' | 'nicht_aktiv' | 'keine_bewerbung' | 'abgelehnt';

/** Dauerhafter Fehler (4xx) – nicht wiederholen */
export class LisaAbgelehnt extends Error {}

function namensTeile(name: string | null): { first_name: string; last_name: string | null } {
  const n = (name ?? '').trim();
  const i = n.indexOf(' ');
  return i < 0 ? { first_name: n || 'Bewerber', last_name: null } : { first_name: n.slice(0, i), last_name: n.slice(i + 1) };
}

export function baueLisaBewerbung(
  app: { id: string; source: string | null; applied_at: string | null; campaign: Record<string, unknown> | null },
  cand: { name: string | null; phone_e164: string | null; phone: string | null; email: string | null; location: string | null; consent_at: string | null },
  jobTitel: string | null,
  zugang: Pick<LisaZugang, 'einwilligungText' | 'einwilligungVersion'>,
) {
  const kampagne = app.campaign ?? {};
  const kampagnenName = [kampagne.campaign_name, kampagne.campaign, kampagne.name].find((x) => typeof x === 'string') as string | undefined;
  const metaLead = [kampagne.leadgen_id, kampagne.meta_lead_id, kampagne.lead_id].find((x) => typeof x === 'string' || typeof x === 'number');
  return {
    external_id: app.id,
    ...namensTeile(cand.name),
    phone: cand.phone_e164 ?? cand.phone,
    email: cand.email,
    source: lisaQuelle(app.source),
    campaign: kampagnenName ?? null,
    job_title: jobTitel,
    city: cand.location,
    consents: {
      // Der Kunde bestätigt beim Freischalten, dass sein Bewerbungsformular diese Einwilligung enthält
      call: true,
      call_text_version: zugang.einwilligungVersion ?? undefined,
      call_wording: zugang.einwilligungText,
      call_at: cand.consent_at ?? app.applied_at ?? undefined,
      recording: false,
    },
    meta_lead_id: metaLead != null ? String(metaLead) : undefined,
    received_at: app.applied_at ?? undefined,
    extra: { quelle: 'zoepp_cloud', cloud_source: app.source },
  };
}

/** Bewerbung an Lisa schicken. Wirft bei Netzwerk-/5xx-Fehler (Job wiederholt), LisaAbgelehnt bei 4xx. */
export async function sendeAnLisa(svc: SupabaseClient, applicationId: string, agencyId: string): Promise<SendeErgebnis> {
  const zugang = await aktiverLisaZugang(svc, agencyId);
  if (!zugang) return 'nicht_aktiv';

  const { data: a } = await svc
    .from('applications')
    .select('id, candidate_id, job_id, source, applied_at, campaign, lisa_applicant_id')
    .eq('id', applicationId)
    .eq('agency_id', agencyId)
    .maybeSingle();
  const app = a as { id: string; candidate_id: string; job_id: string | null; source: string | null; applied_at: string | null; campaign: Record<string, unknown> | null; lisa_applicant_id: string | null } | null;
  if (!app) return 'keine_bewerbung';
  if (app.lisa_applicant_id) return 'schon_gesendet';

  const [{ data: c }, { data: j }] = await Promise.all([
    svc.from('candidates').select('name, phone, phone_e164, email, location, consent_at').eq('id', app.candidate_id).eq('agency_id', agencyId).maybeSingle(),
    app.job_id ? svc.from('jobs').select('title').eq('id', app.job_id).eq('agency_id', agencyId).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const cand = c as { name: string | null; phone: string | null; phone_e164: string | null; email: string | null; location: string | null; consent_at: string | null } | null;
  if (!cand) return 'keine_bewerbung';

  const body = JSON.stringify(baueLisaBewerbung(app, cand, (j as { title: string } | null)?.title ?? null, zugang));
  const res = await fetch(`${zugang.basisUrl}/api/v1/applicants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${zugang.apiKey}` },
    body,
    signal: AbortSignal.timeout(8000),
  });
  const antwort = (await res.json().catch(() => ({}))) as { applicant_id?: string; error?: string; duplicate?: boolean };
  const jetzt = new Date().toISOString();

  if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
    const fehler = `Lisa lehnt die Bewerbung ab (${res.status}): ${antwort.error ?? 'ohne Begründung'}`;
    await svc.from('lisa_verbindungen').update({ letzter_fehler: fehler.slice(0, 500), updated_at: jetzt }).eq('agency_id', agencyId);
    throw new LisaAbgelehnt(fehler);
  }
  if (!res.ok) throw new Error(`Lisa nicht erreichbar (${res.status})`);

  await svc.from('applications').update({ lisa_applicant_id: antwort.applicant_id ?? 'gesendet', lisa_gesendet_am: jetzt }).eq('id', app.id).eq('agency_id', agencyId);
  await svc.from('lisa_verbindungen').update({ letzter_versand_am: jetzt, letzter_fehler: null, updated_at: jetzt }).eq('agency_id', agencyId);
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: app.candidate_id,
    action: antwort.duplicate ? 'An Hiring Lisa übergeben (war schon bekannt)' : 'An Hiring Lisa übergeben – KI-Anruf folgt',
    action_type: 'other',
    metadata: { art: 'lisa_gesendet', application_id: app.id, lisa_applicant_id: antwort.applicant_id ?? null },
  });
  return 'gesendet';
}

/** Ersatz, wenn Lisa die Bewerbung nicht annimmt: der Innendienst ruft an (wie ohne Lisa) */
async function ersatzAnruf(svc: SupabaseClient, applicationId: string, agencyId: string, grund: string) {
  const { data } = await svc.from('applications').select('candidate_id').eq('id', applicationId).eq('agency_id', agencyId).maybeSingle();
  const candidateId = (data as { candidate_id: string } | null)?.candidate_id;
  if (!candidateId) return;
  const { starteAnrufErsatz } = await import('@/lib/cadence/ersatz');
  await starteAnrufErsatz(svc, agencyId, candidateId, grund).catch(() => {});
  await logActivity(svc, { agency_id: agencyId, candidate_id: candidateId, action: `Hiring Lisa: ${grund} – Innendienst ruft an`, action_type: 'other', metadata: { art: 'lisa_ersatz' } });
}

/** Job lisa.bewerbung (Wiederholung). Nach 4 Fehlversuchen oder Ablehnung übernimmt der Innendienst. */
export async function jobLisaBewerbung(svc: SupabaseClient, payload: { application_id: string }, agencyId: string, versuche: number): Promise<SendeErgebnis> {
  try {
    const r = await sendeAnLisa(svc, payload.application_id, agencyId);
    // Inzwischen pausiert → niemand würde anrufen
    if (r === 'nicht_aktiv') await ersatzAnruf(svc, payload.application_id, agencyId, 'pausiert');
    return r;
  } catch (err) {
    if (err instanceof LisaAbgelehnt) {
      await ersatzAnruf(svc, payload.application_id, agencyId, 'Bewerbung abgelehnt');
      return 'abgelehnt';
    }
    if (versuche >= 4) {
      await ersatzAnruf(svc, payload.application_id, agencyId, 'nicht erreichbar');
      return 'abgelehnt';
    }
    throw err;
  }
}

/**
 * Aus dem Bewerbungseingang: sofort senden (60-Sekunden-Ziel), bei Fehler als Job mit Wiederholung einreihen.
 * true = Lisa ist für diese Bewerbung zuständig (eigener Erstkontakt der Cloud entfällt).
 */
export async function uebergebeAnLisa(svc: SupabaseClient, applicationId: string, agencyId: string): Promise<boolean> {
  if (!(await aktiverLisaZugang(svc, agencyId))) return false;
  try {
    const r = await sendeAnLisa(svc, applicationId, agencyId);
    if (r === 'gesendet' || r === 'schon_gesendet') return true;
    if (r === 'nicht_aktiv') return false;
  } catch (err) {
    if (err instanceof LisaAbgelehnt) return false; // dauerhaft abgelehnt → eigener Erstkontakt der Cloud
    console.error('[lisa] Sofort-Übergabe fehlgeschlagen, Job eingereiht', applicationId, err);
  }
  await insertDeduped(svc, 'scheduled_jobs', {
    agency_id: agencyId,
    run_at: new Date(Date.now() + 60_000).toISOString(),
    type: 'lisa.bewerbung',
    payload: { application_id: applicationId },
    status: 'pending',
    dedupe_key: `lisa.bewerbung:${applicationId}`,
  }).catch((e) => console.error('[lisa] Job nicht eingereiht', applicationId, e));
  return true;
}

/** Erschienen / No-Show eines von Lisa gebuchten Termins an Lisa melden (für Lisas Statistik). Best effort, schickt nichts an den Bewerber. */
export async function meldeAnwesenheitAnLisa(svc: SupabaseClient, agencyId: string, lisaAppointmentId: string, erschienen: boolean): Promise<boolean> {
  const { ladeLisaVerbindung, basisUrl } = await import('./verbindung');
  const row = await ladeLisaVerbindung(svc, agencyId);
  if (!row?.api_key_enc || row.status === 'angefragt') return false;
  const { decryptSecret } = await import('@/lib/crypto');
  const res = await fetch(`${basisUrl(row)}/api/v1/appointments/${encodeURIComponent(lisaAppointmentId)}/attendance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${decryptSecret(row.api_key_enc)}` },
    body: JSON.stringify({ attended: erschienen }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  return !!res?.ok;
}
