/**
 * Worker-Funktionen für SLA-Warnungen, WhatsApp-Fenster-Ablauf und Dokumentenanforderung.
 * Phase 4, Task 11.
 * Spec: SLA 24h/48h bei Stage qualified; Fenster-Ablauf-Warnung; Dokumente-Anforderungs-Template.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification, createNotificationForAgency } from '@/lib/notifications/create';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { logActivity } from '@/lib/activity/log';

// ---------------------------------------------------------------------------
// processSlaRecruiter24h — SLA-Warnung nach 24h ohne Reaktion
// ---------------------------------------------------------------------------

export async function processSlaRecruiter24h(
  svc: SupabaseClient,
  agencyId: string,
  payload: { application_id: string },
): Promise<void> {
  const { data: app } = await svc
    .from('applications')
    .select('id, stage_id, candidate_id, assigned_to, updated_at')
    .eq('id', payload.application_id)
    .eq('agency_id', agencyId)
    .single();
  if (!app) return;

  // Stage-Typ prüfen: noch qualified?
  const { data: stage } = await svc
    .from('pipeline_stages')
    .select('stage_type')
    .eq('id', app.stage_id)
    .maybeSingle();
  if (!stage || stage.stage_type !== 'qualified') return;

  // Ausgehende Nachrichten seit Qualifizierung prüfen
  const { data: conv } = await svc
    .from('conversations')
    .select('id')
    .eq('agency_id', agencyId)
    .filter('candidate_id', 'eq', app.candidate_id)
    .maybeSingle();

  if (conv) {
    const { count } = await svc
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .eq('direction', 'out')
      .gte('created_at', app.updated_at);
    if ((count ?? 0) > 0) return;
  }

  // Kandidaten-Name laden
  const { data: candidate } = await svc
    .from('candidates')
    .select('name')
    .eq('id', app.candidate_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  const title = `SLA-Warnung: ${candidate?.name ?? 'Bewerber'} wartet seit 24h auf Reaktion`;

  if (app.assigned_to) {
    await createNotification(svc, {
      user_id: app.assigned_to,
      agency_id: agencyId,
      title,
      type: 'sla_breach',
      push_url: `/inbox?conversation=${conv?.id ?? ''}`,
    }).catch(() => {});
  } else {
    await createNotificationForAgency(svc, agencyId, {
      title,
      type: 'sla_breach',
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// processSlaRecruiter48h — Eskalation nach 48h ohne Reaktion an agency_owner
// ---------------------------------------------------------------------------

export async function processSlaRecruiter48h(
  svc: SupabaseClient,
  agencyId: string,
  payload: { application_id: string },
): Promise<void> {
  const { data: app } = await svc
    .from('applications')
    .select('id, stage_id, candidate_id, updated_at')
    .eq('id', payload.application_id)
    .eq('agency_id', agencyId)
    .single();
  if (!app) return;

  const { data: stage } = await svc
    .from('pipeline_stages')
    .select('stage_type')
    .eq('id', app.stage_id)
    .maybeSingle();
  if (!stage || stage.stage_type !== 'qualified') return;

  const { data: conv } = await svc
    .from('conversations')
    .select('id')
    .eq('agency_id', agencyId)
    .filter('candidate_id', 'eq', app.candidate_id)
    .maybeSingle();

  if (conv) {
    const { count } = await svc
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conv.id)
      .eq('direction', 'out')
      .gte('created_at', app.updated_at);
    if ((count ?? 0) > 0) return;
  }

  const { data: candidate } = await svc
    .from('candidates')
    .select('name')
    .eq('id', app.candidate_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  // An agency_owner eskalieren
  const { data: owner } = await svc
    .from('users')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('role', 'agency_owner')
    .maybeSingle();

  if (owner) {
    await createNotification(svc, {
      user_id: owner.id,
      agency_id: agencyId,
      title: `Eskalation: ${candidate?.name ?? 'Bewerber'} wartet seit 48h — keine Reaktion`,
      type: 'sla_breach',
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// processWindowExpiry — Warnung wenn WhatsApp-Fenster in < 2h abläuft
// ---------------------------------------------------------------------------

export async function processWindowExpiry(
  svc: SupabaseClient,
  agencyId: string,
  payload: { conversation_id: string },
): Promise<void> {
  const { data: conv } = await svc
    .from('conversations')
    .select('id, state, window_expires_at, assigned_to, candidate_id')
    .eq('id', payload.conversation_id)
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (!conv || conv.state !== 'human_active') return;

  if (!conv.window_expires_at) return;
  const expiresAt = new Date(conv.window_expires_at);
  const twoHoursFromNow = new Date(Date.now() + 2 * 60 * 60_000);
  if (expiresAt > twoHoursFromNow) return; // Noch genügend Zeit

  const { data: candidate } = await svc
    .from('candidates')
    .select('name')
    .eq('id', conv.candidate_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  const minutesLeft = Math.round((expiresAt.getTime() - Date.now()) / 60_000);
  const title = `Fenster läuft ab: ${candidate?.name ?? 'Bewerber'} — noch ${minutesLeft} Min.`;

  if (conv.assigned_to) {
    await createNotification(svc, {
      user_id: conv.assigned_to,
      agency_id: agencyId,
      title,
      type: 'system',
      push_url: `/inbox?conversation=${conv.id}`,
    }).catch(() => {});
  } else {
    await createNotificationForAgency(svc, agencyId, {
      title,
      type: 'system',
    }).catch(() => {});
  }
}

// ---------------------------------------------------------------------------
// processDocumentsRequest — Dokumente-Anforderungs-Template senden
// ---------------------------------------------------------------------------

export async function processDocumentsRequest(
  svc: SupabaseClient,
  agencyId: string,
  payload: { application_id: string; stage_id: string },
): Promise<void> {
  // Prüfe: noch in gleicher Stufe?
  const { data: app } = await svc
    .from('applications')
    .select('id, stage_id, candidate_id')
    .eq('id', payload.application_id)
    .eq('agency_id', agencyId)
    .single();
  if (!app || app.stage_id !== payload.stage_id) return;

  // Dokument bereits vorhanden?
  const { count } = await svc
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('application_id', payload.application_id);
  if ((count ?? 0) > 0) return;

  // Conversation laden
  const { data: conv } = await svc
    .from('conversations')
    .select('id, wa_account_id')
    .eq('agency_id', agencyId)
    .filter('candidate_id', 'eq', app.candidate_id)
    .maybeSingle();
  if (!conv) return;

  // Kandidat laden
  const { data: candidate } = await svc
    .from('candidates')
    .select('name, phone_e164')
    .eq('id', app.candidate_id)
    .eq('agency_id', agencyId)
    .single();
  if (!candidate?.phone_e164) return;

  // Template laden
  const { data: tmpl } = await svc
    .from('whatsapp_templates')
    .select('id, name')
    .eq('wa_account_id', conv.wa_account_id)
    .eq('preset_key', 'documents_request')
    .eq('status', 'approved')
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (!tmpl) return;

  // Stage-Name für Template-Variable laden
  const { data: stageData } = await svc
    .from('pipeline_stages')
    .select('name')
    .eq('id', payload.stage_id)
    .maybeSingle();

  const vorname = (candidate.name || '').split(' ')[0];

  await sendWhatsAppMessage(svc, {
    agencyId,
    conversationId: conv.id,
    candidatePhone: candidate.phone_e164,
    waAccountId: conv.wa_account_id,
    payload: {
      to: candidate.phone_e164,
      type: 'template',
      template: {
        name: tmpl.name,
        language: { code: 'de' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: vorname },
              { type: 'text', text: stageData?.name ?? 'Unterlagen' },
            ],
          },
        ],
      },
    },
    senderType: 'system',
    templateId: tmpl.id,
  }).catch(() => {});

  await logActivity(svc, {
    agency_id: agencyId,
    candidate_id: app.candidate_id,
    action: 'Unterlagen angefordert (automatisch)',
    action_type: 'documents_request',
  });
}

// ---------------------------------------------------------------------------
// scheduleStageReminders — SLA- und Dokumente-Jobs planen bei Stage-Wechsel
// ---------------------------------------------------------------------------

export async function scheduleStageReminders(
  svc: SupabaseClient,
  agencyId: string,
  applicationId: string,
  stageId: string,
  stageType: string,
  requiresDocuments: boolean,
): Promise<void> {
  if (stageType === 'qualified') {
    await svc.from('scheduled_jobs').upsert(
      {
        agency_id: agencyId,
        run_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
        type: 'sla.recruiter_24h',
        payload: { application_id: applicationId },
        status: 'pending',
        dedupe_key: `sla24:${applicationId}`,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    );

    await svc.from('scheduled_jobs').upsert(
      {
        agency_id: agencyId,
        run_at: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
        type: 'sla.recruiter_48h',
        payload: { application_id: applicationId },
        status: 'pending',
        dedupe_key: `sla48:${applicationId}`,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    );
  }

  if (requiresDocuments) {
    await svc.from('scheduled_jobs').upsert(
      {
        agency_id: agencyId,
        run_at: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
        type: 'documents.request',
        payload: { application_id: applicationId, stage_id: stageId },
        status: 'pending',
        dedupe_key: `docs:${applicationId}:${stageId}`,
      },
      { onConflict: 'dedupe_key', ignoreDuplicates: true },
    );
  }
}
