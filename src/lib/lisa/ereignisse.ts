/**
 * Rückmeldungen von Hiring Lisa verarbeiten (aus events_inbox, Typ 'lisa.ereignis').
 * Anrufe landen im Anruf-Protokoll (quelle 'lisa'), Termine im Bewerber-Kalender, Status setzt die Phase.
 * Schickt NICHTS an Bewerber. WhatsApp-Ereignisse von Lisa gehen nur mit Freigabe 'lisa_whatsapp' weiter.
 * Service-Role → jede Abfrage filtert auf agency_id.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/activity/log';
import { istFreigegeben } from '@/lib/freigaben';
import { absageCodeFuerStatus, anrufErgebnis, anrufNotiz, phaseFuerStatus, type LisaAnruf } from './protokoll';

interface LisaBewerber {
  id?: string;
  external_id?: string | null;
  status?: string | null;
}
interface LisaTermin {
  id?: string;
  starts_at?: string | null;
  status?: string | null;
  meeting_type?: string | null;
  meeting_url?: string | null;
  location?: string | null;
  leader?: { name?: string | null } | null;
}
export interface LisaEreignis {
  id?: string;
  type?: string;
  event?: string;
  data?: { applicant?: LisaBewerber; applicant_id?: string; appointment_id?: string; call?: LisaAnruf; appointment?: LisaTermin; previous_status?: string | null } & LisaTermin;
  applicant?: LisaBewerber;
  appointment?: LisaTermin;
}

interface Zuordnung {
  applicationId: string;
  candidateId: string;
}

/** Bewerbung über external_id (= applications.id) oder die gespeicherte Lisa-ID finden – nur beim eigenen Kunden */
async function findeBewerbung(svc: SupabaseClient, agencyId: string, b: LisaBewerber | undefined): Promise<Zuordnung | null> {
  if (!b) return null;
  const istUuid = (s: string | null | undefined) => !!s && /^[0-9a-f-]{36}$/i.test(s);
  let q = null as null | { id: string; candidate_id: string };
  if (istUuid(b.external_id)) {
    const { data } = await svc.from('applications').select('id, candidate_id').eq('id', b.external_id!).eq('agency_id', agencyId).maybeSingle();
    q = data as typeof q;
  }
  if (!q && b.id) {
    const { data } = await svc.from('applications').select('id, candidate_id').eq('lisa_applicant_id', b.id).eq('agency_id', agencyId).maybeSingle();
    q = data as typeof q;
  }
  return q ? { applicationId: q.id, candidateId: q.candidate_id } : null;
}

async function anrufErfassen(svc: SupabaseClient, agencyId: string, z: Zuordnung, call: LisaAnruf) {
  const result = anrufErgebnis(call);
  await svc.from('call_logs').insert({
    candidate_id: z.candidateId,
    agency_id: agencyId,
    user_id: null,
    quelle: 'lisa',
    result,
    notes: anrufNotiz(call),
    duration_seconds: typeof call.duration_sec === 'number' ? Math.round(call.duration_sec) : null,
  });

  // Speed-to-Lead wie beim Anruf durch einen Menschen
  const { data: c } = await svc.from('candidates').select('first_dial_at, first_contact_at, created_at').eq('id', z.candidateId).eq('agency_id', agencyId).maybeSingle();
  const cand = c as { first_dial_at: string | null; first_contact_at: string | null; created_at: string } | null;
  if (cand) {
    const jetzt = new Date();
    const upd: Record<string, unknown> = {};
    if (!cand.first_dial_at) upd.first_dial_at = jetzt.toISOString();
    if (!cand.first_contact_at && result !== 'nicht_erreicht' && result !== 'falsche_nummer') {
      upd.first_contact_at = jetzt.toISOString();
      upd.ttfc_seconds = Math.max(0, Math.round((jetzt.getTime() - new Date(cand.created_at).getTime()) / 1000));
    }
    if (Object.keys(upd).length) await svc.from('candidates').update(upd).eq('id', z.candidateId).eq('agency_id', agencyId);
  }
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: z.candidateId,
    action: `KI-Anruf (Hiring Lisa): ${result.replace(/_/g, ' ')}`,
    action_type: 'call',
    metadata: { art: 'lisa_anruf', result, lisa_outcome: call.outcome ?? null, lisa_result: call.result ?? null, attempt: call.attempt_no ?? null },
  });
}

async function phaseSetzen(svc: SupabaseClient, agencyId: string, z: Zuordnung, status: string) {
  const typ = phaseFuerStatus(status);
  if (!typ) return;
  const { stageVomTyp, getStagesForAgency } = await import('@/lib/pipeline/get-stages');
  const stages = await getStagesForAgency(svc, agencyId);
  const ziel =
    (await stageVomTyp(svc, agencyId, [typ])) ??
    stages.find((s) => (typ === 'rejected' ? /^abgesagt/i : /^(termin|vorstellungs)/i).test(s.name)) ??
    null;
  if (!ziel) return;
  const { data: c } = await svc.from('candidates').select('current_stage_id, cadence_active').eq('id', z.candidateId).eq('agency_id', agencyId).maybeSingle();
  const cand = c as { current_stage_id: string | null; cadence_active: boolean | null } | null;
  if (!cand || cand.current_stage_id === ziel.id) return;
  // Nur vorwärts: wer schon weiter ist (Probetag, eingestellt, abgesagt), bleibt dort
  const aktuell = stages.find((s) => s.id === cand.current_stage_id);
  if (aktuell && ['hired', 'offer', 'rejected'].includes(aktuell.stage_type ?? '')) return;
  if (typ === 'interview' && aktuell?.stage_type === 'interview') return;

  const jetzt = new Date().toISOString();
  const code = absageCodeFuerStatus(status);
  const update: Record<string, unknown> = { current_stage_id: ziel.id };
  if (code) {
    const { absageFelder } = await import('@/lib/recruiting/absagegruende');
    Object.assign(update, absageFelder({ code, notiz: 'Im KI-Anruf (Hiring Lisa)', userId: null, phaseId: cand.current_stage_id, jetzt }));
  }
  await svc.from('candidates').update(update).eq('id', z.candidateId).eq('agency_id', agencyId);
  await svc.from('candidate_stages').insert({ candidate_id: z.candidateId, stage_id: ziel.id, changed_by: null });
  await svc
    .from('applications')
    .update({ stage_id: ziel.id, ...(code ? { status: 'rejected' } : {}), updated_at: jetzt })
    .eq('id', z.applicationId)
    .eq('agency_id', agencyId);
  if (code) {
    const { stoppeAbgesagtenBewerber } = await import('@/lib/recruiting/absage-stopp');
    await stoppeAbgesagtenBewerber(svc, { candidateId: z.candidateId, agencyId, applicationIds: [z.applicationId], cadenceActive: cand.cadence_active, jetzt }).catch(() => {});
  }
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: z.candidateId,
    action: `Hiring Lisa: Phase „${ziel.name}“`,
    action_type: 'stage_change',
    metadata: { art: 'lisa_phase', lisa_status: status, stage_id: ziel.id },
  });
}

const TERMIN_STATUS: Record<string, 'geplant' | 'abgesagt' | 'erschienen' | 'no_show'> = {
  'appointment.booked': 'geplant',
  'appointment.rescheduled': 'geplant',
  'appointment.confirmed': 'geplant',
  'appointment.canceled': 'abgesagt',
  'appointment.attended': 'erschienen',
  'appointment.no_show': 'no_show',
};

async function terminSpiegeln(svc: SupabaseClient, agencyId: string, z: Zuordnung, typ: string, t: LisaTermin) {
  const status = TERMIN_STATUS[typ];
  if (!t.id || !status) return;
  const notiz = [
    '🤖 Von Hiring Lisa gebucht',
    t.leader?.name ? `Führungskraft: ${t.leader.name}` : null,
    t.meeting_url ? `Link: ${t.meeting_url}` : t.location ? `Ort: ${t.location}` : null,
    typ === 'appointment.confirmed' ? 'Bewerber hat per WhatsApp bestätigt' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const { data: vorhanden } = await svc.from('candidate_appointments').select('id').eq('lisa_appointment_id', t.id).eq('agency_id', agencyId).maybeSingle();
  const id = (vorhanden as { id: string } | null)?.id;
  if (id) {
    const upd: Record<string, unknown> = { status };
    if (t.starts_at || t.leader?.name || typ === 'appointment.confirmed') upd.notes = notiz;
    if (t.starts_at && status === 'geplant') upd.scheduled_at = t.starts_at;
    await svc.from('candidate_appointments').update(upd).eq('id', id).eq('agency_id', agencyId);
  } else if (t.starts_at) {
    // Direkt angelegt: die Cloud plant dafür KEINE eigenen Erinnerungen (die macht Lisa) – keine doppelte Ansprache
    await svc.from('candidate_appointments').insert({
      candidate_id: z.candidateId,
      agency_id: agencyId,
      type: 'vorstellungsgespraech',
      scheduled_at: t.starts_at,
      status,
      notes: notiz,
      lisa_appointment_id: t.id,
    });
  }
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: z.candidateId,
    action: `Hiring Lisa: Termin ${status === 'abgesagt' ? 'abgesagt' : typ === 'appointment.rescheduled' ? 'verschoben' : status === 'geplant' ? 'gebucht' : status}${t.starts_at ? ` (${new Date(t.starts_at).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })})` : ''}`,
    action_type: status === 'abgesagt' ? 'appointment_cancelled' : status === 'erschienen' ? 'appointment_done' : status === 'no_show' ? 'appointment_no_show' : 'appointment_booked',
    metadata: { art: 'lisa_termin', lisa_appointment_id: t.id, typ },
  });
}

/** WhatsApp-Ereignis von Lisa: nur mit Freigabe, und nur über vorhandene, geprüfte Wege der Cloud */
async function whatsappEreignis(svc: SupabaseClient, agencyId: string, z: Zuordnung, ereignis: string) {
  const frei = await istFreigegeben(svc, 'lisa_whatsapp');
  let ergebnis = 'nicht gesendet (Freigabe „Hiring Lisa: WhatsApp“ aus)';
  if (frei && ereignis === 'nicht_erreicht') {
    // Bestehender Weg: prüft eigene Freigabe, Sperren, Ruhezeiten, höchstens alle 3 Tage
    const { planeBewerberNichtErreicht } = await import('@/lib/recruiting/nicht-erreicht');
    ergebnis = (await planeBewerberNichtErreicht(svc, z.candidateId, agencyId)) ? 'eingeplant' : 'nicht eingeplant (Freigabe „Bewerber nicht erreicht“ aus oder schon geplant)';
  } else if (frei) {
    ergebnis = 'nicht gesendet (für dieses Ereignis ist noch keine Vorlage angebunden)';
  }
  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: z.candidateId,
    action: `Hiring Lisa – WhatsApp „${ereignis}“: ${ergebnis}`,
    action_type: 'other',
    metadata: { art: 'lisa_whatsapp', ereignis, ergebnis },
  });
}

export async function verarbeiteLisaEreignis(svc: SupabaseClient, agencyId: string, e: LisaEreignis): Promise<string> {
  const typ = e.type ?? '';
  // Lisa liefert teils verschachtelt ({applicant: {...}}), teils flach ({applicant_id, appointment_id})
  const bewerber = e.data?.applicant ?? e.applicant ?? (e.data?.applicant_id ? { id: e.data.applicant_id } : undefined);
  const z = await findeBewerbung(svc, agencyId, bewerber);
  await svc.from('lisa_verbindungen').update({ letztes_ereignis_am: new Date().toISOString() }).eq('agency_id', agencyId);
  if (!z) return 'bewerbung_unbekannt';

  if (bewerber?.id) {
    await svc.from('applications').update({ lisa_applicant_id: bewerber.id }).eq('id', z.applicationId).eq('agency_id', agencyId);
  }

  if (typ.startsWith('whatsapp.')) {
    await whatsappEreignis(svc, agencyId, z, e.event ?? typ.slice('whatsapp.'.length));
    return 'whatsapp';
  }
  switch (typ) {
    case 'applicant.created':
      return 'zugeordnet';
    case 'call.completed':
      if (e.data?.call) await anrufErfassen(svc, agencyId, z, e.data.call);
      return 'anruf';
    case 'applicant.status_changed':
      if (bewerber?.status) await phaseSetzen(svc, agencyId, z, bewerber.status);
      return 'status';
    case 'applicant.do_not_call': {
      // Keine Anrufe mehr (auch nicht vom Innendienst); WhatsApp bleibt erlaubt
      const { data: c } = await svc.from('candidates').select('cadence_active').eq('id', z.candidateId).eq('agency_id', agencyId).maybeSingle();
      if ((c as { cadence_active: boolean } | null)?.cadence_active) {
        const { stopCadence } = await import('@/lib/cadence/engine');
        await stopCadence(svc, z.candidateId, 'do_not_call').catch(() => {});
      }
      await logActivity(svc, { agency_id: agencyId, candidate_id: z.candidateId, action: 'Hiring Lisa: Bewerber möchte nicht mehr angerufen werden', action_type: 'other', metadata: { art: 'lisa_do_not_call' } });
      return 'do_not_call';
    }
    default:
      if (typ.startsWith('appointment.')) {
        const termin =
          e.data?.appointment ?? e.appointment ?? (e.data?.appointment_id ? { id: e.data.appointment_id } : e.data?.id ? (e.data as LisaTermin) : undefined);
        if (termin) await terminSpiegeln(svc, agencyId, z, typ, termin);
        return 'termin';
      }
      return 'ignoriert';
  }
}
