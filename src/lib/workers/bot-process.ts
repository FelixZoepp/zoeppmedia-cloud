/**
 * Worker: KI-Vorqualifizierungs-Bot — Kern-Dialog-Turn.
 * Verarbeitet eingehende Nachrichten, ruft LLM auf, speichert Antworten,
 * führt Abschluss-Scoring durch und delegiert Übergaben.
 * Phase 3 Task 7.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { llmJsonCall, llmTextCall, DIALOG_MODEL, SCORING_MODEL } from '@/lib/ai/llm-client';
import { dialogOutputSchema, type DialogOutput } from '@/lib/bot/schema';
import { buildSystemBlocks, buildTurnMessages, PROMPT_VERSION } from '@/lib/bot/prompt';
import { computeScore, type AnswerForScoring } from '@/lib/bot/scoring';
import { armBotTimers, cancelBotTimers } from '@/lib/bot/timers';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { createNotificationForAgency } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';
import { handoverToHuman } from '@/lib/bot/handover';
import type { BotConfig, BotQuestion, BotMeta } from '@/lib/types/database';

// ---------------------------------------------------------------------------
// Öffentliche API
// ---------------------------------------------------------------------------

export async function processBotTurn(
  svc: SupabaseClient,
  agencyId: string,
  payload: { conversation_id: string },
  attempts: number,
): Promise<void> {
  const { conversation_id: conversationId } = payload;

  // -------------------------------------------------------------------------
  // Step 1: Conversation laden + State-Guard
  // -------------------------------------------------------------------------
  const { data: conv } = await svc
    .from('conversations')
    .select('id, state, bot_step, bot_meta, application_id, candidate_id, wa_account_id, assigned_to')
    .eq('id', conversationId)
    .eq('agency_id', agencyId)
    .maybeSingle();

  if (!conv || conv.state !== 'bot_active') return;

  const botMeta: BotMeta = (conv.bot_meta as BotMeta) ?? {};
  const botStep: number = (conv.bot_step as number) ?? 0;

  // -------------------------------------------------------------------------
  // Step 2: Letzte 30 Nachrichten laden; neue Inbound-Nachrichten bestimmen
  // -------------------------------------------------------------------------
  const { data: messages } = await svc
    .from('messages')
    .select('id, direction, body, created_at')
    .eq('conversation_id', conversationId)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: true })
    .limit(30);

  const msgList = (messages ?? []) as Array<{ id: string; direction: 'in' | 'out'; body: string; created_at: string }>;

  // Neue Inbound = alle 'in'-Nachrichten nach der letzten 'out'-Nachricht
  let lastOutIdx = -1;
  for (let i = msgList.length - 1; i >= 0; i--) {
    if (msgList[i].direction === 'out') {
      lastOutIdx = i;
      break;
    }
  }

  const newInbound = msgList
    .slice(lastOutIdx + 1)
    .filter((m) => m.direction === 'in')
    .map((m) => m.body);

  // Idempotenz-Guard: keine neuen Inbound-Nachrichten → return
  if (newInbound.length === 0) return;

  // -------------------------------------------------------------------------
  // Step 3: Application + Job + Config + Questions + Answers laden
  // -------------------------------------------------------------------------
  const { data: application } = await svc
    .from('applications')
    .select('id, candidate_id, job_id, stage_id, agency_id')
    .eq('id', conv.application_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  const { data: job } = application
    ? await svc
        .from('jobs')
        .select('id, title, description, location, bot_config_id, agency_id')
        .eq('id', application.job_id)
        .eq('agency_id', agencyId)
        .maybeSingle()
    : { data: null };

  const { data: botConfig } = job?.bot_config_id
    ? await svc
        .from('bot_configs')
        .select('*')
        .eq('id', job.bot_config_id)
        .eq('agency_id', agencyId)
        .maybeSingle()
    : { data: null };

  const { data: candidate } = await svc
    .from('candidates')
    .select('id, name, phone_e164')
    .eq('id', conv.candidate_id)
    .eq('agency_id', agencyId)
    .maybeSingle();

  const { data: agency } = await svc
    .from('agencies')
    .select('name')
    .eq('id', agencyId)
    .maybeSingle();

  // Kein Bot-Config / inaktiv → Übergabe
  if (!botConfig || !(botConfig as BotConfig).active || !candidate) {
    await handoverToHuman(svc, {
      agencyId,
      conversationId,
      candidateId: conv.candidate_id,
      candidateName: candidate?.name ?? 'Bewerber',
      candidatePhone: candidate?.phone_e164 ?? '',
      waAccountId: conv.wa_account_id,
      assignedTo: conv.assigned_to ?? null,
      reason: 'Bot-Konfiguration fehlt',
    });
    return;
  }

  const cfg = botConfig as BotConfig;

  const { data: questionsRaw } = await svc
    .from('bot_questions')
    .select('*')
    .eq('bot_config_id', cfg.id)
    .eq('agency_id', agencyId)
    .order('position', { ascending: true });

  const questions = (questionsRaw ?? []) as BotQuestion[];

  const { data: existingAnswersRaw } = await svc
    .from('application_answers')
    .select('question_key, answer_normalized, origin')
    .eq('application_id', conv.application_id)
    .eq('agency_id', agencyId);

  const existingAnswers = (existingAnswersRaw ?? []) as Array<{
    question_key: string;
    answer_normalized: { value: unknown; confidence: number } | null;
    origin: string;
  }>;

  // Beantwortet-Map aufbauen
  const answeredKeys = new Set(existingAnswers.map((a) => a.question_key));

  // Fragestatus bestimmen
  const questionsWithStatus = questions.map((q) => ({
    ...q,
    status: (answeredKeys.has(q.key) ? 'beantwortet' : 'offen') as
      | 'offen'
      | 'beantwortet'
      | 'übersprungen',
  }));

  // Erste offene Required-Frage bestimmen
  const firstOpenRequired = questionsWithStatus.find(
    (q) => q.required && q.status === 'offen',
  );
  const currentQuestionKey = firstOpenRequired?.key ?? null;

  // -------------------------------------------------------------------------
  // Step 4: PromptContext bauen + LLM-Aufruf
  // -------------------------------------------------------------------------
  const promptCtx = {
    agencyName: agency?.name ?? agencyId,
    job: {
      title: (job as { title: string })?.title ?? '',
      description: (job as { description: string | null })?.description ?? null,
      location: (job as { location: string | null })?.location ?? null,
    },
    config: cfg,
    questions: questionsWithStatus,
    currentQuestionKey,
  };

  const systemBlocks = buildSystemBlocks(promptCtx);

  // History (ohne die neuen Inbound-Nachrichten am Ende — die werden separat angehängt)
  const historyMsgs = msgList.slice(0, lastOutIdx + 1);
  const turnMessages = buildTurnMessages(historyMsgs, newInbound);

  let dialogOutput: DialogOutput;

  try {
    dialogOutput = await llmJsonCall<DialogOutput>(svc, {
      agencyId,
      conversationId,
      purpose: 'dialog',
      model: DIALOG_MODEL,
      promptVersion: PROMPT_VERSION,
      system: systemBlocks,
      messages: turnMessages,
      maxTokens: 1024,
      schema: dialogOutputSchema,
    });
  } catch (err) {
    // P3-R8: Nach 3 Versuchen → Übergabe statt Throw
    if (attempts >= 3) {
      await handoverToHuman(svc, {
        agencyId,
        conversationId,
        candidateId: conv.candidate_id,
        candidateName: candidate.name,
        candidatePhone: candidate.phone_e164 ?? '',
        waAccountId: conv.wa_account_id,
        assignedTo: conv.assigned_to ?? null,
        reason: 'Bot gerade nicht verfügbar',
      });
      return;
    }
    throw err;
  }

  // -------------------------------------------------------------------------
  // Step 5: Intent-Verarbeitung
  // -------------------------------------------------------------------------

  // STOP: bereits von whatsapp-inbound behandelt → No-op
  if (dialogOutput.intent === 'stop') {
    return;
  }

  // Handover-Request oder handover-Flag
  if (dialogOutput.intent === 'handover_request' || dialogOutput.handover === true) {
    await handoverToHuman(svc, {
      agencyId,
      conversationId,
      candidateId: conv.candidate_id,
      candidateName: candidate.name,
      candidatePhone: candidate.phone_e164 ?? '',
      waAccountId: conv.wa_account_id,
      assignedTo: conv.assigned_to ?? null,
      reason: dialogOutput.handover_reason ?? 'Bewerber hat Übergabe angefragt',
    });
    return;
  }

  // Terminwunsch → Übergabe an Mensch
  // Phase 3 hat keine Terminbuchung — Terminwünsche übernimmt ein Mensch.
  if (dialogOutput.intent === 'reschedule') {
    await handoverToHuman(svc, {
      agencyId,
      conversationId,
      candidateId: conv.candidate_id,
      candidateName: candidate.name,
      candidatePhone: candidate.phone_e164 ?? '',
      waAccountId: conv.wa_account_id,
      assignedTo: conv.assigned_to ?? null,
      reason: 'Terminwunsch des Bewerbers',
    });
    return;
  }

  // off_topic/question/unclear: kein Handover — reply_text lenkt zurück zur aktuellen Frage (Spec §8 listet off_topic nicht als Übergabe-Trigger)

  // max_turns Guard (nach LLM-Aufruf, damit wir den Turn mitzählen)
  const currentTurns = botMeta.turns ?? 0;
  if (currentTurns >= cfg.max_turns) {
    await handoverToHuman(svc, {
      agencyId,
      conversationId,
      candidateId: conv.candidate_id,
      candidateName: candidate.name,
      candidatePhone: candidate.phone_e164 ?? '',
      waAccountId: conv.wa_account_id,
      assignedTo: conv.assigned_to ?? null,
      reason: 'Maximale Gesprächslänge erreicht',
    });
    return;
  }

  // -------------------------------------------------------------------------
  // Konfigurierte Question-Keys als Set für Filter (P3-R10)
  // -------------------------------------------------------------------------
  const questionKeySet = new Set(questions.map((q) => q.key));

  // -------------------------------------------------------------------------
  // Antworten verarbeiten und speichern
  // -------------------------------------------------------------------------
  const validAnswers = dialogOutput.answers.filter((a) => questionKeySet.has(a.question_key));

  for (const ans of validAnswers) {
    await svc
      .from('application_answers')
      .upsert(
        {
          agency_id: agencyId,
          application_id: conv.application_id,
          question_key: ans.question_key,
          answer_raw: ans.evidence,
          answer_normalized: { value: ans.value, confidence: ans.confidence },
          origin: 'bot',
        },
        { onConflict: 'application_id,question_key' },
      );
  }

  // Aktualisierte Beantwortet-Keys
  for (const ans of validAnswers) {
    answeredKeys.add(ans.question_key);
  }

  // -------------------------------------------------------------------------
  // bot_meta aktualisieren: turns, low_confidence, clarify
  // -------------------------------------------------------------------------
  const newBotMeta: BotMeta = {
    ...botMeta,
    turns: (botMeta.turns ?? 0) + 1,
  };

  // Confidence-Prüfung: niedrigste Confidence aus gültigen Antworten
  if (validAnswers.length > 0) {
    const minConfidence = Math.min(...validAnswers.map((a) => a.confidence));

    if (minConfidence < 0.6) {
      const prevLow = botMeta.low_confidence ?? 0;
      const newLow = prevLow + 1;
      newBotMeta.low_confidence = newLow;

      if (newLow >= 2) {
        await handoverToHuman(svc, {
          agencyId,
          conversationId,
          candidateId: conv.candidate_id,
          candidateName: candidate.name,
          candidatePhone: candidate.phone_e164 ?? '',
          waAccountId: conv.wa_account_id,
          assignedTo: conv.assigned_to ?? null,
          reason: 'Niedrige Konfidenz — Bewerber antwortet unklar',
        });
        return;
      }
    } else {
      // Alle Antworten haben hohe Confidence → Zähler zurücksetzen
      newBotMeta.low_confidence = 0;
    }
  }
  // Kein validAnswers-Turn: low_confidence-Zähler unverändert tragen (kein Reset)

  // needs_clarification-Guard: clarify-Zähler je question_key
  if (dialogOutput.needs_clarification && currentQuestionKey) {
    const clarify = { ...(botMeta.clarify ?? {}) };
    const prevClarify = clarify[currentQuestionKey] ?? 0;
    const newClarify = prevClarify + 1;
    clarify[currentQuestionKey] = newClarify;
    newBotMeta.clarify = clarify;

    if (newClarify > 2) {
      await handoverToHuman(svc, {
        agencyId,
        conversationId,
        candidateId: conv.candidate_id,
        candidateName: candidate.name,
        candidatePhone: candidate.phone_e164 ?? '',
        waAccountId: conv.wa_account_id,
        assignedTo: conv.assigned_to ?? null,
        reason: `Mehrfache Klärungsversuche für Frage "${currentQuestionKey}"`,
      });
      return;
    }
  }

  // -------------------------------------------------------------------------
  // Nächste offene Required-Frage bestimmen
  // -------------------------------------------------------------------------
  const nextOpenRequired = questions.find(
    (q) => q.required && !answeredKeys.has(q.key),
  );
  const allRequiredAnswered = nextOpenRequired === undefined;

  // -------------------------------------------------------------------------
  // Step 6: Abschluss-Block (alle required beantwortet)
  // -------------------------------------------------------------------------
  if (allRequiredAnswered) {
    // Score berechnen
    const answersForScoring: AnswerForScoring[] = [
      ...existingAnswers.map((a) => ({
        question_key: a.question_key,
        value: a.answer_normalized?.value,
      })),
      ...validAnswers.map((a) => ({
        question_key: a.question_key,
        value: a.value,
      })),
    ];
    // Deduplizieren (validAnswers überschreiben existingAnswers)
    const dedupMap = new Map<string, AnswerForScoring>();
    for (const a of answersForScoring) {
      dedupMap.set(a.question_key, a);
    }
    const finalAnswers = Array.from(dedupMap.values());

    const scoreResult = computeScore(questions, finalAnswers, cfg.scoring_rules);

    // Scoring-Begründung via LLM (best effort)
    let summary: string | null = null;
    try {
      const scoringSystem = [
        { text: 'Du bist ein Recruiting-Assistent. Schreibe präzise und professionell auf Deutsch.' },
      ];
      const scoringUserMsg = [
        'Fragen und normalisierte Antworten:',
        JSON.stringify(finalAnswers, null, 2),
        '',
        'Score-Ergebnis:',
        JSON.stringify(scoreResult, null, 2),
        '',
        'Schreibe auf Deutsch: (1) eine Begründung des Ergebnisses in 2 Sätzen, (2) eine Zusammenfassung des Bewerbers in genau 5 Sätzen für den Recruiter. Keine Empfehlung zur Einstellung.',
      ].join('\n');

      summary = await llmTextCall(svc, {
        agencyId,
        conversationId,
        purpose: 'scoring',
        model: SCORING_MODEL,
        promptVersion: PROMPT_VERSION,
        system: scoringSystem,
        messages: [{ role: 'user', content: scoringUserMsg }],
        maxTokens: 512,
      });
    } catch {
      // best effort — summary bleibt null
    }

    // Application-UPDATE mit Score (mit agency_id-Scoping)
    await svc
      .from('applications')
      .update({
        score: scoreResult.score,
        score_label: scoreResult.label,
        score_reasons: scoreResult.reasons,
        summary,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conv.application_id)
      .eq('agency_id', agencyId);

    // Stage-UPDATE bei A/B: auf pipeline_stage mit stage_type='qualified'
    if (scoreResult.label === 'A' || scoreResult.label === 'B') {
      const { data: qualifiedStage } = await svc
        .from('pipeline_stages')
        .select('id')
        .eq('agency_id', agencyId)
        .eq('stage_type', 'qualified')
        .maybeSingle();

      if (qualifiedStage) {
        await svc
          .from('applications')
          .update({ stage_id: qualifiedStage.id, updated_at: new Date().toISOString() })
          .eq('id', conv.application_id)
          .eq('agency_id', agencyId);
      }
    } else {
      // Label C: manuelle Prüfung notwendig
      await createNotificationForAgency(svc, agencyId, {
        title: 'Manuelle Prüfung nötig',
        body: `Bewerber ${candidate.name} hat Score ${scoreResult.score} (Label C).`,
        type: 'system',
        push_url: `/inbox?conversation=${conversationId}`,
      }).catch(() => {});
    }

    // Abschlussnachricht OHNE Entscheidung an Bewerber
    const abschlussText =
      'Vielen Dank für deine Antworten! Wir haben alle Informationen erhalten und melden uns bald bei dir.';

    try {
      await sendWhatsAppMessage(svc, {
        agencyId,
        conversationId,
        candidatePhone: candidate.phone_e164 ?? '',
        waAccountId: conv.wa_account_id,
        payload: {
          to: candidate.phone_e164 ?? '',
          type: 'text',
          text: { body: abschlussText },
        },
        senderType: 'bot',
      });
    } catch (sendErr) {
      // Preflight-Fehler (Fenster zu) → ignorieren; andere Fehler rethrow
      const msg = sendErr instanceof Error ? sendErr.message : '';
      if (
        msg.includes('Fenster') ||
        msg.includes('window') ||
        msg.includes('opt_in') ||
        msg.includes('Consent') ||
        msg.includes('Preflight')
      ) {
        // Nudge-Template übernimmt — ignore
      } else {
        throw sendErr;
      }
    }

    // state = 'waiting' (P3-R1), cancelBotTimers
    await svc
      .from('conversations')
      .update({
        state: 'waiting',
        bot_meta: newBotMeta,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
      .eq('agency_id', agencyId);

    await cancelBotTimers(svc, { agencyId, conversationId });

    // logActivity bot_completed
    await logActivity(svc, {
      agency_id: agencyId,
      candidate_id: conv.candidate_id,
      action: `Bot-Vorqualifizierung abgeschlossen (Score: ${scoreResult.score}, Label: ${scoreResult.label})`,
      action_type: 'bot_completed',
      metadata: { score: scoreResult.score, label: scoreResult.label },
    });

    // Phase 4 P4-R2: Bei A/B automatisch Termineinladung
    if (scoreResult.label === 'A' || scoreResult.label === 'B') {
      try {
        const { createProposedAppointment } = await import('@/lib/appointments/lifecycle');

        // Job-Daten für Terminart
        const jobType = (job as { appointment_type?: string })?.appointment_type ?? 'call';
        const jobLocation = (job as { appointment_location?: string })?.appointment_location ?? null;

        const { appointmentId, bookingToken } = await createProposedAppointment(svc, {
          agencyId,
          applicationId: conv.application_id,
          type: jobType as 'call' | 'video' | 'onsite',
          location: jobLocation,
        });

        // Buchungslink zusammenbauen
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
        const buchungslink = `${baseUrl}/book/${bookingToken}`;

        // appointment_invite-Template senden
        const { data: inviteTmpl } = await svc.from('whatsapp_templates')
          .select('id, name')
          .eq('wa_account_id', conv.wa_account_id)
          .eq('preset_key', 'appointment_invite')
          .eq('status', 'approved')
          .eq('agency_id', agencyId)
          .maybeSingle();

        if (inviteTmpl && candidate.phone_e164) {
          const vorname = (candidate.name || '').split(' ')[0] || 'Bewerber';
          const jobTitle = (job as { title: string })?.title ?? '';

          await sendWhatsAppMessage(svc, {
            agencyId,
            conversationId,
            candidatePhone: candidate.phone_e164,
            waAccountId: conv.wa_account_id,
            payload: {
              to: candidate.phone_e164,
              type: 'template',
              template: {
                name: inviteTmpl.name,
                language: { code: 'de' },
                components: [{
                  type: 'body',
                  parameters: [
                    { type: 'text', text: vorname },
                    { type: 'text', text: jobTitle },
                    { type: 'text', text: buchungslink },
                  ],
                }],
              },
            },
            senderType: 'system',
            templateId: inviteTmpl.id,
          }).catch((e) => console.error('appointment_invite send failed', e));
        }

        // invite_followup +24h
        await svc.from('scheduled_jobs').upsert({
          agency_id: agencyId,
          run_at: new Date(Date.now() + 24 * 60 * 60_000).toISOString(),
          type: 'appointment.invite_followup',
          payload: { appointment_id: appointmentId },
          status: 'pending',
          dedupe_key: `appt.invite_followup:${appointmentId}`,
        }, { onConflict: 'dedupe_key', ignoreDuplicates: true });
      } catch (e) {
        // Termineinladung ist best effort — Bot-Abschluss bleibt intakt
        console.error('Termineinladung fehlgeschlagen', e);
      }
    }

    // fireEvent bot.completed
    const { fireEvent } = await import('@/lib/automations/fire');
    await fireEvent('bot.completed', agencyId, {
      candidate_id: conv.candidate_id,
      extra: {
        application_id: conv.application_id,
        score: scoreResult.score,
        label: scoreResult.label,
      },
    }).catch(() => {});

    return;
  }

  // -------------------------------------------------------------------------
  // Noch offene Fragen: Reply senden + bot_step/meta/Timer aktualisieren
  // -------------------------------------------------------------------------
  const nextBotStep = nextOpenRequired ? nextOpenRequired.position : botStep + 1;

  try {
    await sendWhatsAppMessage(svc, {
      agencyId,
      conversationId,
      candidatePhone: candidate.phone_e164 ?? '',
      waAccountId: conv.wa_account_id,
      payload: {
        to: candidate.phone_e164 ?? '',
        type: 'text',
        text: { body: dialogOutput.reply_text },
      },
      senderType: 'bot',
    });
  } catch (sendErr) {
    // Preflight-Fehler (Fenster zu) → Timer lassen, return
    const msg = sendErr instanceof Error ? sendErr.message : '';
    if (
      msg.includes('Fenster') ||
      msg.includes('window') ||
      msg.includes('opt_in') ||
      msg.includes('Consent') ||
      msg.includes('Preflight')
    ) {
      return;
    }
    throw sendErr;
  }

  // bot_step + bot_meta aktualisieren
  await svc
    .from('conversations')
    .update({
      bot_step: nextBotStep,
      bot_meta: newBotMeta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', conversationId)
    .eq('agency_id', agencyId);

  // Timer neu armen
  await cancelBotTimers(svc, { agencyId, conversationId });
  await armBotTimers(svc, { agencyId, conversationId, botStep: nextBotStep });
}
