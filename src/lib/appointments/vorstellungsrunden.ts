/**
 * Vorstellungsrunden laden (DB). Ohne Migration 20261016000490 liefern alle Funktionen
 * „nicht verfügbar“ – dann gilt das bisherige Verhalten (Einzelslots).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  angeboteneRunden, formatDerStelle, istSchemaFehler, standardAdresse,
  type Runde, type TerminFormat,
} from '@/lib/appointments/termin-format';

export interface TerminEinstellung {
  format: TerminFormat;
  /** Ort/Link der Stelle (jobs.appointment_location) */
  ort: string | null;
  /** Vorschlag für neue Runden: Ort der Stelle, sonst Anschrift des Unternehmens */
  standardAdresse: string;
  /** Migration fehlt noch → nur die bisherigen Formate */
  migrationFehlt: boolean;
}

export async function ladeTerminEinstellung(svc: SupabaseClient, agencyId: string, jobId: string): Promise<TerminEinstellung | null> {
  const neu = await svc.from('jobs')
    .select('appointment_type, appointment_location, termin_format')
    .eq('id', jobId).eq('agency_id', agencyId).maybeSingle();
  let job = neu.data as { appointment_type?: string | null; appointment_location?: string | null; termin_format?: string | null } | null;
  let migrationFehlt = false;
  if (neu.error) {
    if (!istSchemaFehler(neu.error)) return null;
    migrationFehlt = true;
    const alt = await svc.from('jobs').select('appointment_type, appointment_location')
      .eq('id', jobId).eq('agency_id', agencyId).maybeSingle();
    job = alt.data as typeof job;
  }
  if (!job) return null;
  const { data: agency } = await svc.from('agencies').select('anschrift').eq('id', agencyId).maybeSingle();
  return {
    format: migrationFehlt ? formatDerStelle({ appointment_type: job.appointment_type }) : formatDerStelle(job),
    ort: job.appointment_location ?? null,
    standardAdresse: standardAdresse(job.appointment_location, (agency as { anschrift?: string | null } | null)?.anschrift),
    migrationFehlt,
  };
}

export interface RundenTeilnehmer {
  id: string;
  application_id: string;
  status: string;
  vorstellungsrunde_id: string | null;
  candidate_id: string | null;
  name: string;
  telefon: string | null;
}

/** Runden einer Stelle inkl. gebuchter Bewerber; null = Migration fehlt */
export async function ladeRunden(
  svc: SupabaseClient,
  agencyId: string,
  jobId: string,
  opts: { ab?: Date; mitTeilnehmern?: boolean } = {},
): Promise<{ runden: Runde[]; teilnehmer: RundenTeilnehmer[] } | null> {
  let q = svc.from('vorstellungsrunden')
    .select('id, starts_at, ends_at, adresse, hinweis, max_teilnehmer')
    .eq('agency_id', agencyId).eq('job_id', jobId);
  if (opts.ab) q = q.gte('starts_at', opts.ab.toISOString());
  const { data, error } = await q.order('starts_at');
  if (error) {
    if (istSchemaFehler(error)) return null;
    throw new Error('Vorstellungsrunden konnten nicht geladen werden');
  }
  const runden = (data ?? []) as Runde[];
  if (!runden.length) return { runden, teilnehmer: [] };

  const { data: termine } = await svc.from('appointments')
    .select('id, application_id, status, vorstellungsrunde_id')
    .eq('agency_id', agencyId)
    .in('vorstellungsrunde_id', runden.map((r) => r.id));
  const liste = (termine ?? []) as Array<{ id: string; application_id: string; status: string; vorstellungsrunde_id: string | null }>;
  if (!opts.mitTeilnehmern) return { runden, teilnehmer: liste.map((t) => ({ ...t, candidate_id: null, name: '', telefon: null })) };

  const appIds = [...new Set(liste.map((t) => t.application_id))];
  const { data: apps } = appIds.length
    ? await svc.from('applications').select('id, candidate_id').eq('agency_id', agencyId).in('id', appIds)
    : { data: [] };
  const appZuKandidat = new Map(((apps ?? []) as Array<{ id: string; candidate_id: string }>).map((a) => [a.id, a.candidate_id]));
  const kandIds = [...new Set(appZuKandidat.values())];
  const { data: kand } = kandIds.length
    ? await svc.from('candidates').select('id, name, phone_e164').eq('agency_id', agencyId).in('id', kandIds)
    : { data: [] };
  const kandidaten = new Map(((kand ?? []) as Array<{ id: string; name: string | null; phone_e164: string | null }>).map((c) => [c.id, c]));

  return {
    runden,
    teilnehmer: liste.map((t) => {
      const cid = appZuKandidat.get(t.application_id) ?? null;
      const c = cid ? kandidaten.get(cid) : undefined;
      return { ...t, candidate_id: cid, name: c?.name || 'Bewerber', telefon: c?.phone_e164 ?? null };
    }),
  };
}

export type BuchungsModus =
  | { modus: 'vorstellungsrunde'; runden: Array<Runde & { freie_plaetze: number }> }
  | { modus: 'einzel'; format: TerminFormat | null; ort: string | null };

/**
 * Was dem Bewerber über den Buchungslink angeboten wird: Runden mit freiem Platz (Vorstellungsrunde)
 * oder Einzelslots. Ohne Migration/Stelle immer Einzelslots (bisheriges Verhalten).
 */
export async function ladeBuchungsModus(
  svc: SupabaseClient,
  appt: { id: string; agency_id: string; application_id: string },
): Promise<BuchungsModus> {
  const einzel: BuchungsModus = { modus: 'einzel', format: null, ort: null };
  const { data: application } = await svc.from('applications')
    .select('job_id').eq('id', appt.application_id).eq('agency_id', appt.agency_id).maybeSingle();
  const jobId = (application as { job_id?: string } | null)?.job_id;
  if (!jobId) return einzel;
  const einstellung = await ladeTerminEinstellung(svc, appt.agency_id, jobId);
  if (!einstellung) return einzel;
  if (einstellung.migrationFehlt || einstellung.format !== 'vorstellungsrunde') {
    return { modus: 'einzel', format: einstellung.format, ort: einstellung.ort };
  }
  const geladen = await ladeRunden(svc, appt.agency_id, jobId, { ab: new Date() });
  if (!geladen) return einzel;
  // Beim Verschieben die bereits gebuchte Runde nicht erneut anbieten
  const eigeneRunde = geladen.teilnehmer.find((t) => t.id === appt.id && ['booked', 'confirmed'].includes(t.status))?.vorstellungsrunde_id;
  return {
    modus: 'vorstellungsrunde',
    runden: angeboteneRunden(geladen.runden.filter((r) => r.id !== eigeneRunde), geladen.teilnehmer, { eigeneTerminId: appt.id }),
  };
}
