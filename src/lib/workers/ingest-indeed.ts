/**
 * Worker für events_inbox payload.type = 'ingest.indeed'.
 * Extrahiert Bewerberdaten aus dem Indeed-POST, lädt den Lebenslauf in den
 * Supabase-Bucket "recruiting-documents" und ruft ingestApplication auf.
 * Bei fehlendem WhatsApp-Opt-in wird eine Fallback-Mail verschickt.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { ingestApplication } from '@/lib/recruiting/ingest';
import { logActivity } from '@/lib/activity/log';
import { sendOptInFallbackEmail } from '@/lib/email/resend';
import { isUuid } from '@/lib/supabase/filters';

interface Extracted {
  applyId: string;
  jobRef: string | null;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  consentWhatsapp: boolean;
  answers: Array<{ questionKey: string; questionText: string; answerRaw: string; origin: 'indeed' }>;
  resume: { data: string; mime: string; fileName: string } | null;
}

export function extractIndeedApplication(body: Record<string, unknown>): Extracted {
  const applicant = (body.applicant ?? {}) as Record<string, unknown>;
  const job = (body.job ?? {}) as Record<string, unknown>;
  const qa = (Array.isArray(body.questionsAndAnswers) ? body.questionsAndAnswers : []) as Array<{
    question?: { id?: string; question?: string };
    answer?: unknown;
  }>;

  let firstName = typeof applicant.firstName === 'string' ? applicant.firstName : '';
  let lastName = typeof applicant.lastName === 'string' ? applicant.lastName : '';
  if (!firstName && typeof applicant.fullName === 'string') {
    const parts = applicant.fullName.trim().split(/\s+/);
    firstName = parts[0] ?? '';
    lastName = parts.slice(1).join(' ');
  }

  const answerFor = (id: string): string | null => {
    const hit = qa.find((x) => x.question?.id === id);
    return hit && hit.answer != null ? String(hit.answer) : null;
  };

  const phone =
    (typeof applicant.phoneNumber === 'string' && applicant.phoneNumber) ||
    answerFor('phone') ||
    '';
  const consentWhatsapp = (answerFor('consent_whatsapp') ?? '').toLowerCase() === 'ja';

  const file = ((applicant.resume as Record<string, unknown> | undefined)?.file ?? null) as
    | { contentType?: string; fileName?: string; data?: string }
    | null;
  const resume =
    file && typeof file.data === 'string' && file.data.length > 0
      ? {
          data: file.data,
          mime: file.contentType || 'application/pdf',
          fileName: file.fileName || 'lebenslauf.pdf',
        }
      : null;

  return {
    applyId: String(body.id ?? ''),
    jobRef: typeof job.jobId === 'string' ? job.jobId : null,
    firstName,
    lastName,
    phone,
    email: typeof applicant.email === 'string' ? applicant.email : null,
    consentWhatsapp,
    answers: qa.map((x) => ({
      questionKey: x.question?.id ?? 'frage',
      questionText: x.question?.question ?? x.question?.id ?? 'Frage',
      answerRaw: x.answer != null ? String(x.answer) : '',
      origin: 'indeed' as const,
    })),
    resume,
  };
}

/** Worker für events_inbox payload.type = 'ingest.indeed'. */
export async function processIngestIndeed(
  svc: SupabaseClient,
  agencyId: string | null,
  payload: { body: Record<string, unknown> }
): Promise<void> {
  const x = extractIndeedApplication(payload.body);
  if (!x.applyId || !x.jobRef) throw new Error('ingest.indeed: id oder job.jobId fehlt');

  // Job auflösen (UUID oder external_ref) — Agentur kommt aus dem Job.
  // Bei external_ref + bekannter agencyId auf die Agentur eingrenzen, da external_refs
  // agenturübergreifend nicht eindeutig sein müssen. Ist agencyId null (globaler Lookup),
  // bleibt die Query ungescopet — der Mismatch-Throw danach fängt falsche Zuordnungen ab.
  const jobQuery = isUuid(x.jobRef)
    ? svc.from('jobs').select('id, agency_id, slug').eq('id', x.jobRef).single()
    : agencyId
      ? svc.from('jobs').select('id, agency_id, slug').eq('external_ref', x.jobRef).eq('agency_id', agencyId).limit(1).single()
      : svc.from('jobs').select('id, agency_id, slug').eq('external_ref', x.jobRef).limit(1).single();
  const { data: jobRow } = await jobQuery;
  if (!jobRow) throw new Error(`ingest.indeed: Job ${x.jobRef} nicht gefunden`);
  if (agencyId && jobRow.agency_id !== agencyId)
    throw new Error('ingest.indeed: agency_id-Mismatch zwischen Event und Job');

  // Lebenslauf zuerst in den Storage, damit ingestApplication die documents-Row anlegt
  let resume: { storagePath: string; mime: string; size: number } | null = null;
  if (x.resume) {
    const buffer = Buffer.from(x.resume.data, 'base64');
    const ext = x.resume.fileName.split('.').pop() || 'pdf';
    const storagePath = `${jobRow.agency_id}/resumes/indeed-${x.applyId}.${ext}`;
    const { error: uploadErr } = await svc.storage
      .from('recruiting-documents')
      .upload(storagePath, buffer, { contentType: x.resume.mime, upsert: true });
    if (uploadErr) {
      console.error('[ingest.indeed] Lebenslauf-Upload fehlgeschlagen:', uploadErr.message);
    } else {
      resume = { storagePath, mime: x.resume.mime, size: buffer.length };
    }
  }

  const result = await ingestApplication(svc, {
    agencyId: jobRow.agency_id,
    jobId: jobRow.id,
    firstName: x.firstName,
    lastName: x.lastName || null,
    phone: x.phone || null,
    email: x.email ?? null,
    source: 'indeed',
    sourceRef: x.applyId,
    consentWhatsapp: x.consentWhatsapp,
    consentSource: 'indeed',
    answers: x.answers,
    resume,
  });

  // Ohne WhatsApp-Opt-in oder ungültige Telefonnummer: Bot startet nicht — Hinweis + Fallback-Mail
  if (!x.consentWhatsapp || result.phoneInvalid) {
    await logActivity(svc, {
      agency_id: jobRow.agency_id,
      candidate_id: result.candidateId,
      action: 'Kein WhatsApp-Opt-in aus Indeed-Bewerbung — Bot nicht gestartet.',
      action_type: 'note',
      metadata: { source: 'indeed', apply_id: x.applyId, phone_invalid: result.phoneInvalid },
    }).catch((e) => console.error('[ingest.indeed] logActivity fehlgeschlagen:', e));

    if (x.email) {
      const { data: agency } = await svc
        .from('agencies')
        .select('slug')
        .eq('id', jobRow.agency_id)
        .single();
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
      if (agency?.slug) {
        await sendOptInFallbackEmail(
          x.email,
          x.firstName,
          `${baseUrl}/apply/${agency.slug}/${jobRow.slug}`
        ).catch((e) => console.error('[ingest.indeed] Fallback-Mail fehlgeschlagen:', e));
      }
    }
  }
}
