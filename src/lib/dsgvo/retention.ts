// src/lib/dsgvo/retention.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAudit } from '@/lib/audit/log';
import { AUFNAHME_BUCKET, aufnahmePfad } from '@/lib/recordings/pfad';

/** Dateien entfernen; Fehler abbrechen lassen, damit der Kandidat nicht als anonymisiert gilt */
async function entferneDateien(svc: SupabaseClient, bucket: string, paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await svc.storage.from(bucket).remove(paths);
  if (error) throw new Error(`Dateien in ${bucket} konnten nicht gelöscht werden: ${error.message}`);
}

/** Supabase-Schreibfehler nicht verschlucken */
function pruefe(result: { error: { message: string } | null } | null | undefined, schritt: string): void {
  if (result?.error) throw new Error(`Anonymisierung (${schritt}) fehlgeschlagen: ${result.error.message}`);
}

export async function anonymizeCandidate(
  svc: SupabaseClient,
  agencyId: string,
  candidateId: string,
  actorUserId: string | null
): Promise<void> {
  const { data: apps } = await svc
    .from('applications')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('candidate_id', candidateId);
  const appIds = (apps ?? []).map((a: { id: string }) => a.id);

  if (appIds.length > 0) {
    const { data: docs } = await svc
      .from('documents')
      .select('id, storage_path')
      .eq('agency_id', agencyId)
      .in('application_id', appIds);
    const paths = (docs ?? []).map((d: { storage_path: string }) => d.storage_path).filter(Boolean);
    // Lebensläufe liegen je nach Quelle in verschiedenen Buckets (Indeed-Apply: recruiting-documents,
    // Bewerbungsformular/Indeed-Mail: candidate-resumes). Entfernen in einem Bucket ohne Datei ist harmlos.
    await entferneDateien(svc, 'candidate-resumes', paths);
    await entferneDateien(svc, 'recruiting-documents', paths);
    if ((docs ?? []).length > 0) {
      pruefe(await svc.from('documents').delete().eq('agency_id', agencyId).in('application_id', appIds), 'documents');
    }
    pruefe(
      await svc
        .from('application_answers')
        .update({ answer_raw: null, answer_normalized: null, question_text: null })
        .in('application_id', appIds),
      'application_answers'
    );
    pruefe(
      await svc
        .from('applications')
        .update({ summary: null, score_reasons: null })
        .eq('agency_id', agencyId)
        .eq('candidate_id', candidateId),
      'applications'
    );
  }

  const { data: convs } = await svc
    .from('conversations')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('candidate_id', candidateId);
  const convIds = (convs ?? []).map((c: { id: string }) => c.id);
  if (convIds.length > 0) {
    // WhatsApp-Dateien zuerst löschen – danach ist der Pfad weg und die Datei nicht mehr auffindbar
    const { data: medien } = await svc
      .from('messages')
      .select('media_path')
      .eq('agency_id', agencyId)
      .in('conversation_id', convIds)
      .not('media_path', 'is', null);
    const medienPfade = ((medien ?? []) as Array<{ media_path: string | null }>)
      .map((m) => m.media_path)
      .filter((p): p is string => !!p);
    await entferneDateien(svc, 'whatsapp-media', medienPfade);

    pruefe(
      await svc
        .from('messages')
        .update({ body: null, media_path: null })
        .eq('agency_id', agencyId)
        .in('conversation_id', convIds),
      'messages'
    );
  }

  const { data: recordings } = await svc
    .from('call_recordings')
    .select('id, file_url')
    .eq('agency_id', agencyId)
    .eq('candidate_id', candidateId);
  const recordingRows = (recordings ?? []) as Array<{ id: string; file_url: string }>;
  const recordingPaths = recordingRows
    .map((r) => aufnahmePfad(r.file_url))
    .filter((p): p is string => p !== null);
  await entferneDateien(svc, AUFNAHME_BUCKET, recordingPaths);
  if (recordingRows.length > 0) {
    pruefe(
      await svc
        .from('call_recordings')
        .update({ transcript: null, analysis: null, file_url: '', file_name: 'Anonymisiert' })
        .eq('agency_id', agencyId)
        .eq('candidate_id', candidateId),
      'call_recordings'
    );
  }

  pruefe(await svc.from('notes').update({ text: 'Anonymisiert (DSGVO)' }).eq('candidate_id', candidateId), 'notes');

  // Rohdaten eingehender Indeed-Mails enthalten Kontaktdaten und ggf. den Lebenslauf
  pruefe(
    await svc
      .from('inbound_email_log')
      .update({ raw_payload: null, subject: null, from_address: 'anonymisiert' })
      .eq('candidate_id', candidateId),
    'inbound_email_log'
  );

  const candidateUpdate = await svc
    .from('candidates')
    .update({
      name: 'Anonymisiert',
      email: null,
      phone: null,
      phone_e164: null,
      location: null,
      experience_summary: null,
      last_employer: null,
      indeed_job_title: null,
      resume_url: null,
      vorquali_json: null,
      anonymized_at: new Date().toISOString(),
    })
    .eq('agency_id', agencyId)
    .eq('id', candidateId);
  pruefe(candidateUpdate, 'candidates');

  await logAudit(svc, {
    agency_id: agencyId,
    user_id: actorUserId,
    entity_type: 'candidate',
    entity_id: candidateId,
    action: 'anonymize',
  });
}

/** Höchstens so viele Anonymisierungen je Lauf – verhindert Massenläufe und Zeitüberschreitung */
const MAX_ANONYMISIERUNGEN_JE_LAUF = 200;
const SEITE = 200;

export async function runRetention(
  svc: SupabaseClient
): Promise<{ checked: number; anonymized: number; failed: number }> {
  let checked = 0;
  let anonymized = 0;
  let failed = 0;
  const { data: agencies } = await svc.from('agencies').select('id, retention_days');
  for (const agency of agencies ?? []) {
    if (anonymized >= MAX_ANONYMISIERUNGEN_JE_LAUF) break;
    const days = (agency.retention_days ?? 180) as number;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Seitenweise per id-Cursor: übersprungene Kandidaten (offene Bewerbung) blockieren sonst
    // dauerhaft die ersten 200 Plätze und alle weiteren werden nie geprüft.
    let letzteId: string | null = null;
    while (anonymized < MAX_ANONYMISIERUNGEN_JE_LAUF) {
      let query = svc
        .from('candidates')
        .select('id')
        .eq('agency_id', agency.id)
        .is('anonymized_at', null)
        .lt('created_at', cutoff)
        .order('id')
        .limit(SEITE);
      if (letzteId) query = query.gt('id', letzteId);
      const { data: candidates, error } = await query;
      if (error) throw new Error(`Retention: Kandidaten nicht ladbar: ${error.message}`);
      const seite = (candidates ?? []) as Array<{ id: string }>;

      for (const cand of seite) {
        if (anonymized >= MAX_ANONYMISIERUNGEN_JE_LAUF) break;
        checked += 1;
        const { count: openCount } = await svc
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('agency_id', agency.id)
          .eq('candidate_id', cand.id)
          .eq('status', 'open');
        if ((openCount ?? 0) > 0) continue;
        const { data: recent } = await svc
          .from('applications')
          .select('id')
          .eq('agency_id', agency.id)
          .eq('candidate_id', cand.id)
          .gt('updated_at', cutoff)
          .limit(1);
        if ((recent ?? []).length > 0) continue;
        try {
          await anonymizeCandidate(svc, agency.id, cand.id, null);
          anonymized += 1;
        } catch (err) {
          // Einzelfehler protokollieren, Kandidat bleibt offen und wird beim nächsten Lauf erneut versucht
          failed += 1;
          console.error('[retention] Anonymisierung fehlgeschlagen', cand.id, err);
        }
      }

      if (seite.length < SEITE) break;
      letzteId = seite[seite.length - 1].id;
    }
  }
  return { checked, anonymized, failed };
}
