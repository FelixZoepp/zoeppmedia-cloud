// src/lib/dsgvo/retention.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import { logAudit } from '@/lib/audit/log';

/**
 * Extracts the storage path from a Supabase signed URL for the call-recordings bucket.
 * Signed URLs look like: https://x.supabase.co/storage/v1/object/sign/call-recordings/<path>?token=...
 * Returns the decoded path (e.g. "agency-1/1234-audio.mp3") or null if unparseable.
 */
function extractRecordingPath(fileUrl: string): string | null {
  try {
    const marker = '/call-recordings/';
    const idx = fileUrl.indexOf(marker);
    if (idx === -1) return null;
    const withQuery = fileUrl.slice(idx + marker.length);
    const qIdx = withQuery.indexOf('?');
    const raw = qIdx === -1 ? withQuery : withQuery.slice(0, qIdx);
    const decoded = decodeURIComponent(raw);
    return decoded || null;
  } catch {
    return null;
  }
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
    if (paths.length > 0) {
      await svc.storage.from('candidate-resumes').remove(paths);
    }
    if ((docs ?? []).length > 0) {
      await svc.from('documents').delete().eq('agency_id', agencyId).in('application_id', appIds);
    }
    await svc
      .from('application_answers')
      .update({ answer_raw: null, answer_normalized: null, question_text: null })
      .in('application_id', appIds);
    await svc
      .from('applications')
      .update({ summary: null, score_reasons: null })
      .eq('agency_id', agencyId)
      .eq('candidate_id', candidateId);
  }

  const { data: convs } = await svc
    .from('conversations')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('candidate_id', candidateId);
  const convIds = (convs ?? []).map((c: { id: string }) => c.id);
  if (convIds.length > 0) {
    await svc
      .from('messages')
      .update({ body: null, media_path: null })
      .eq('agency_id', agencyId)
      .in('conversation_id', convIds);
  }

  const { data: recordings } = await svc
    .from('call_recordings')
    .select('id, file_url')
    .eq('agency_id', agencyId)
    .eq('candidate_id', candidateId);
  const recordingRows = (recordings ?? []) as Array<{ id: string; file_url: string }>;
  const recordingPaths = recordingRows
    .map((r) => extractRecordingPath(r.file_url))
    .filter((p): p is string => p !== null);
  if (recordingPaths.length > 0) {
    await svc.storage.from('call-recordings').remove(recordingPaths);
  }
  if (recordingRows.length > 0) {
    await svc
      .from('call_recordings')
      .update({ transcript: null, analysis: null, file_url: '', file_name: 'Anonymisiert' })
      .eq('agency_id', agencyId)
      .eq('candidate_id', candidateId);
  }

  await svc.from('notes').update({ text: 'Anonymisiert (DSGVO)' }).eq('candidate_id', candidateId);

  await svc
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

  await logAudit(svc, {
    agency_id: agencyId,
    user_id: actorUserId,
    entity_type: 'candidate',
    entity_id: candidateId,
    action: 'anonymize',
  });
}

export async function runRetention(
  svc: SupabaseClient
): Promise<{ checked: number; anonymized: number }> {
  let checked = 0;
  let anonymized = 0;
  const { data: agencies } = await svc.from('agencies').select('id, retention_days');
  for (const agency of agencies ?? []) {
    const days = (agency.retention_days ?? 180) as number;
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    const { data: candidates } = await svc
      .from('candidates')
      .select('id')
      .eq('agency_id', agency.id)
      .is('anonymized_at', null)
      .lt('created_at', cutoff)
      .limit(200);
    for (const cand of candidates ?? []) {
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
      await anonymizeCandidate(svc, agency.id, cand.id, null);
      anonymized += 1;
    }
  }
  return { checked, anonymized };
}
