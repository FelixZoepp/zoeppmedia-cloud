// Zentrale Eingangsfunktion fuer alle Bewerber-Quellen (Spec Abschn. 6).
// Wird mit Service-Role-Client aufgerufen, umgeht RLS bewusst.

import { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { normalizePhoneE164 } from '@/lib/phone';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';

export interface IngestInput {
  agencyId: string;
  jobId: string;
  firstName: string;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  source: string;
  sourceRef?: string | null;
  campaign?: Record<string, unknown> | null;
  consentWhatsapp?: boolean;
  consentSource?: string | null;
  answers?: Array<{
    questionKey: string;
    questionText?: string;
    answerRaw: string;
    origin: 'indeed' | 'bot' | 'form';
  }>;
  resume?: { storagePath: string; mime: string; size: number } | null;
}

export interface IngestResult {
  candidateId: string;
  applicationId: string | null;
  candidateCreated: boolean;
  applicationCreated: boolean;
  duplicateWithin30Days: boolean;
  phoneInvalid: boolean;
}

// --- Zod-Validierung ---
const ingestInputSchema = z.object({
  agencyId: z.string().uuid(),
  jobId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  source: z.string().min(1),
  sourceRef: z.string().nullable().optional(),
  campaign: z.record(z.string(), z.unknown()).nullable().optional(),
  consentWhatsapp: z.boolean().optional(),
  consentSource: z.string().nullable().optional(),
  answers: z
    .array(
      z.object({
        questionKey: z.string(),
        questionText: z.string().optional(),
        answerRaw: z.string(),
        origin: z.enum(['indeed', 'bot', 'form']),
      })
    )
    .optional(),
  resume: z
    .object({ storagePath: z.string(), mime: z.string(), size: z.number() })
    .nullable()
    .optional(),
});

export async function ingestApplication(
  svc: SupabaseClient,
  input: IngestInput
): Promise<IngestResult> {
  // Validate input — throws ZodError with descriptive message on invalid input
  ingestInputSchema.parse(input);

  const phoneE164 = normalizePhoneE164(input.phone);
  const phoneInvalid = input.phone != null && input.phone.trim() !== '' && phoneE164 === null;
  const emailLower = input.email?.toLowerCase().trim() || null;

  // --- 1. source_ref Idempotenz ---
  if (input.sourceRef) {
    const { data: existingApp } = await svc
      .from('applications')
      .select('id, candidate_id')
      .eq('agency_id', input.agencyId)
      .eq('source', input.source)
      .eq('source_ref', input.sourceRef)
      .maybeSingle();

    if (existingApp) {
      return {
        candidateId: existingApp.candidate_id,
        applicationId: existingApp.id,
        candidateCreated: false,
        applicationCreated: false,
        duplicateWithin30Days: false,
        phoneInvalid,
      };
    }
  }

  // --- 2. Bestehenden Kandidaten suchen (Dublette) ---
  let existingCandidate: { id: string; phone_e164: string | null; email: string | null } | null = null;
  let candidateCreated = false;

  // Primaer: phone_e164 im Mandanten
  if (phoneE164) {
    const { data } = await svc
      .from('candidates')
      .select('id, phone_e164, email')
      .eq('agency_id', input.agencyId)
      .eq('phone_e164', phoneE164)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (data) existingCandidate = data;
  }

  // Fallback: E-Mail case-insensitive (nur wenn phone fehlt)
  if (!existingCandidate && !phoneE164 && emailLower) {
    const { data } = await svc
      .from('candidates')
      .select('id, phone_e164, email')
      .eq('agency_id', input.agencyId)
      .ilike('email', emailLower)
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle();
    if (data) existingCandidate = data;
  }

  // --- Stage-ID einmalig ermitteln (wird fuer Kandidat + Application verwendet) ---
  const newStageId = await getNewStageId(svc, input.agencyId);

  let candidateId: string;

  if (existingCandidate) {
    candidateId = existingCandidate.id;

    // Fehlende Felder ergaenzen (nicht ueberschreiben)
    const updates: Record<string, unknown> = {};
    if (phoneE164 && !existingCandidate.phone_e164) {
      updates.phone_e164 = phoneE164;
    }
    if (emailLower && !existingCandidate.email) {
      updates.email = emailLower;
    }
    // Consent nur setzen wenn noch nicht vorhanden
    if (input.consentWhatsapp) {
      // Check current consent
      const { data: currentCandidate } = await svc
        .from('candidates')
        .select('whatsapp_opt_in, consent_at')
        .eq('id', candidateId)
        .single();
      if (currentCandidate && !currentCandidate.whatsapp_opt_in) {
        updates.whatsapp_opt_in = true;
        updates.consent_at = new Date().toISOString();
        updates.consent_source = input.consentSource || input.source;
      }
    }

    if (Object.keys(updates).length > 0) {
      await svc.from('candidates').update(updates).eq('id', candidateId);
    }
  } else {
    // Neuen Kandidaten anlegen
    const fullName = [input.firstName, input.lastName].filter(Boolean).join(' ');
    const { data: newCandidate, error: candError } = await svc
      .from('candidates')
      .insert({
        agency_id: input.agencyId,
        name: fullName,
        email: emailLower,
        phone: input.phone,
        phone_e164: phoneE164,
        source: input.source,
        current_stage_id: newStageId,
        whatsapp_opt_in: input.consentWhatsapp ?? false,
        consent_at: input.consentWhatsapp ? new Date().toISOString() : null,
        consent_source: input.consentWhatsapp ? (input.consentSource || input.source) : null,
        language: 'de',
      })
      .select('id')
      .single();

    if (candError || !newCandidate) {
      throw new Error(`Kandidat konnte nicht angelegt werden: ${candError?.message}`);
    }
    candidateId = newCandidate.id;
    candidateCreated = true;
  }

  // --- 3. 30-Tage-Regel: gleicher Kandidat + gleicher Job ---
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const { data: recentApp } = await svc
    .from('applications')
    .select('id')
    .eq('candidate_id', candidateId)
    .eq('job_id', input.jobId)
    .gte('applied_at', thirtyDaysAgo.toISOString())
    .limit(1)
    .maybeSingle();

  if (recentApp) {
    // Kein neuer Eintrag, nur activity_log
    await logActivity(svc, {
      agency_id: input.agencyId,
      candidate_id: candidateId,
      action: `Doppelte Bewerbung auf denselben Job innerhalb von 30 Tagen — nicht erneut angelegt`,
      action_type: 'other',
      metadata: {
        source: input.source,
        job_id: input.jobId,
        existing_application_id: recentApp.id,
      },
    });

    if (candidateCreated) {
      // Should not happen (candidate existed if they applied within 30 days),
      // but handle gracefully
      await fireEvent('candidate_created', input.agencyId, { candidate_id: candidateId }).catch(() => {});
    }

    return {
      candidateId,
      applicationId: recentApp.id,
      candidateCreated,
      applicationCreated: false,
      duplicateWithin30Days: true,
      phoneInvalid,
    };
  }

  // --- 4. Neue Application anlegen (newStageId bereits oben ermittelt) ---
  const { data: newApp, error: appError } = await svc
    .from('applications')
    .insert({
      agency_id: input.agencyId,
      candidate_id: candidateId,
      job_id: input.jobId,
      stage_id: newStageId,
      source: input.source,
      source_ref: input.sourceRef || null,
      campaign: input.campaign || null,
      status: 'open',
      applied_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (appError || !newApp) {
    throw new Error(`Application konnte nicht angelegt werden: ${appError?.message}`);
  }

  // --- 5. candidate_stages (Bestandskompatibilitaet) ---
  await svc.from('candidate_stages').insert({
    candidate_id: candidateId,
    stage_id: newStageId,
    changed_by: null,
  });

  // --- 6. application_answers upsert ---
  if (input.answers && input.answers.length > 0) {
    const answerRows = input.answers.map((a) => ({
      agency_id: input.agencyId,
      application_id: newApp.id,
      question_key: a.questionKey,
      question_text: a.questionText || null,
      answer_raw: a.answerRaw,
      origin: a.origin,
    }));
    await svc.from('application_answers').upsert(answerRows, {
      onConflict: 'application_id,question_key',
    });
  }

  // --- 7. Resume -> documents ---
  if (input.resume) {
    await svc.from('documents').insert({
      agency_id: input.agencyId,
      application_id: newApp.id,
      storage_path: input.resume.storagePath,
      mime: input.resume.mime,
      size: input.resume.size,
      origin: input.source,
    });
  }

  // --- 8. activity_log ---
  // Neuer Kandidat: candidate_created; bestehender Kandidat: application_created
  await logActivity(svc, {
    agency_id: input.agencyId,
    candidate_id: candidateId,
    action: `Bewerbung eingegangen (${input.source})`,
    action_type: candidateCreated ? 'candidate_created' : 'application_created',
    metadata: {
      application_id: newApp.id,
      source: input.source,
      source_ref: input.sourceRef || null,
      job_id: input.jobId,
      phone_invalid: phoneInvalid,
    },
  });

  // --- 9. fireEvent nur bei neuem Kandidaten ---
  if (candidateCreated) {
    await fireEvent('candidate_created', input.agencyId, { candidate_id: candidateId }).catch(() => {});
  }

  return {
    candidateId,
    applicationId: newApp.id,
    candidateCreated,
    applicationCreated: true,
    duplicateWithin30Days: false,
    phoneInvalid,
  };
}

/**
 * Gibt die stage_id der Stufe mit stage_type='new' fuer die Agentur zurueck.
 * Fallback: erste Stufe nach sort_order/position.
 */
async function getNewStageId(svc: SupabaseClient, agencyId: string): Promise<string> {
  // Erst agency-spezifische Stufe mit type='new'
  const { data: newStage } = await svc
    .from('pipeline_stages')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('stage_type', 'new')
    .limit(1)
    .maybeSingle();

  if (newStage) return newStage.id;

  // Fallback: erste Stufe der Agentur nach sort_order
  const { data: firstStage } = await svc
    .from('pipeline_stages')
    .select('id')
    .eq('agency_id', agencyId)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (firstStage) return firstStage.id;

  // Letzter Fallback: globale Stufen
  const { data: globalStage } = await svc
    .from('pipeline_stages')
    .select('id')
    .is('agency_id', null)
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (globalStage) return globalStage.id;

  throw new Error(`Keine Pipeline-Stufen fuer Agentur ${agencyId} gefunden`);
}
