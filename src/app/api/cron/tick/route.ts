/**
 * Minuten-Cron: claimed pending events_inbox + fällige scheduled_jobs
 * und dispatcht an Worker-Funktionen.
 * Spec Abschn. 11+13, Orchestrator-Ruling 5.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { processInbound } from '@/lib/workers/whatsapp-inbound';
import { processStatus } from '@/lib/workers/whatsapp-status';
import { processSend } from '@/lib/workers/whatsapp-send';
import { processMediaDownload } from '@/lib/workers/media-download';
import { processBotOpen } from '@/lib/workers/bot-open';
import { processBotNudge } from '@/lib/workers/bot-nudge';
import { processBotNudge2 } from '@/lib/workers/bot-nudge2';
import { processBotTimeout } from '@/lib/workers/bot-timeout';
import { processBotClose } from '@/lib/workers/bot-close';
import { processBotTurn } from '@/lib/workers/bot-process';
import { processIngestIndeed } from '@/lib/workers/ingest-indeed';
import { createNotificationForAgency } from '@/lib/notifications/create';
import {
  processInviteFollowup,
  processReminder24h,
  processReminder2h,
  processFollowupCheck,
  processNoShowFollowup,
} from '@/lib/workers/appointment-reminders';
import {
  processSlaRecruiter24h,
  processSlaRecruiter48h,
  processWindowExpiry,
  processDocumentsRequest,
} from '@/lib/workers/sla-reminders';

// M1: Vercel Fluid Compute — maximal 60 Sekunden Laufzeit
export const maxDuration = 60;

// Retry-Backoff in Minuten
const RETRY_DELAYS = [1, 5, 15, 60];

/** I3: Exportiert für Tests — berechnet Wartezeit in ms vor dem nächsten Versuch. */
export function getRetryDelay(attempts: number): number {
  const idx = Math.min(attempts - 1, RETRY_DELAYS.length - 1);
  return RETRY_DELAYS[idx] * 60 * 1000;
}

/** I3: Exportiert für Tests — prüft ob ein Event/Job den Dead-Letter-Schwellenwert erreicht hat. */
export function isDeadLetter(attempts: number): boolean {
  return attempts >= 5;
}

// M1: Wanduhr-Deadline in ms (50 Sekunden, damit 10s für DB-Aufräumen bleiben)
const WALL_CLOCK_LIMIT_MS = 50_000;

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET nicht konfiguriert' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createAdminClient();
  const startTime = Date.now();
  let eventsProcessed = 0;
  let eventsFailed = 0;
  let jobsProcessed = 0;
  let jobsFailed = 0;

  // 1. events_inbox abarbeiten
  const { data: events } = await svc.rpc('claim_inbox_events', { batch_size: 100 });

  for (const event of events || []) {
    // M1: Wanduhr-Deadline — verbleibende geclaimte Rows zurücksetzen
    if (Date.now() - startTime > WALL_CLOCK_LIMIT_MS) {
      await svc
        .from('events_inbox')
        .update({ status: 'pending' })
        .eq('id', event.id);
      continue;
    }

    try {
      const payload = event.payload as { type: string; [key: string]: unknown };
      switch (payload.type) {
        case 'whatsapp.inbound':
          await processInbound(svc, event.agency_id, payload as unknown as Parameters<typeof processInbound>[2]);
          break;
        case 'whatsapp.status':
          await processStatus(svc, event.agency_id, payload as unknown as Parameters<typeof processStatus>[2]);
          break;
        case 'ingest.indeed':
          await processIngestIndeed(svc, event.agency_id, payload as unknown as Parameters<typeof processIngestIndeed>[2]);
          break;
        default:
          // Unbekannter Typ — als done markieren
          break;
      }
      await svc.from('events_inbox')
        .update({ status: 'done', processed_at: new Date().toISOString() })
        .eq('id', event.id);
      eventsProcessed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      if (isDeadLetter(event.attempts)) {
        await svc.from('events_inbox')
          .update({ status: 'dead', error: errorMsg })
          .eq('id', event.id);

        // Admin-Benachrichtigung bei dead events (R1: Typ 'system')
        if (event.agency_id) {
          await createNotificationForAgency(svc, event.agency_id, {
            title: 'Webhook-Verarbeitung fehlgeschlagen',
            body: `Event ${event.id} (${event.source}) konnte nach 5 Versuchen nicht verarbeitet werden.`,
            type: 'system',
            push_url: '/settings',
          }).catch(() => {});
        }
      } else {
        // C1: retry_at via Backoff setzen damit claim_inbox_events die Row überspringt
        await svc.from('events_inbox')
          .update({
            status: 'pending',
            error: errorMsg,
            retry_at: new Date(Date.now() + getRetryDelay(event.attempts)).toISOString(),
          })
          .eq('id', event.id);
      }
      eventsFailed++;
    }
  }

  // 2. scheduled_jobs abarbeiten
  const { data: jobs } = await svc.rpc('claim_due_jobs', { batch_size: 100 });

  for (const job of jobs || []) {
    // M1: Wanduhr-Deadline — verbleibende geclaimte Rows zurücksetzen
    if (Date.now() - startTime > WALL_CLOCK_LIMIT_MS) {
      await svc
        .from('scheduled_jobs')
        .update({ status: 'pending', updated_at: new Date().toISOString() })
        .eq('id', job.id);
      continue;
    }

    try {
      const payload = job.payload as { [key: string]: unknown };
      switch (job.type) {
        case 'whatsapp.send':
          await processSend(svc, payload as unknown as Parameters<typeof processSend>[1]);
          break;
        case 'media.download':
          await processMediaDownload(svc, job.agency_id, payload as unknown as Parameters<typeof processMediaDownload>[2]);
          break;
        case 'bot.open':
          await processBotOpen(svc, job.agency_id, payload as unknown as Parameters<typeof processBotOpen>[2]);
          break;
        case 'bot.nudge':
          await processBotNudge(svc, job.agency_id, payload as unknown as Parameters<typeof processBotNudge>[2]);
          break;
        case 'bot.timeout':
          await processBotTimeout(svc, job.agency_id, payload as unknown as Parameters<typeof processBotTimeout>[2]);
          break;
        case 'bot.nudge2':
          await processBotNudge2(svc, job.agency_id, payload as { conversation_id: string; bot_step: number });
          break;
        case 'bot.close':
          await processBotClose(svc, job.agency_id, payload as { conversation_id: string; bot_step: number });
          break;
        case 'bot.process':
          await processBotTurn(svc, job.agency_id, payload as { conversation_id: string }, job.attempts);
          break;
        case 'appointment.invite_followup':
          await processInviteFollowup(svc, job.agency_id, payload as { appointment_id: string });
          break;
        case 'appointment.reminder_24h':
          await processReminder24h(svc, job.agency_id, payload as { appointment_id: string });
          break;
        case 'appointment.reminder_2h':
          await processReminder2h(svc, job.agency_id, payload as { appointment_id: string });
          break;
        case 'appointment.followup_check':
          await processFollowupCheck(svc, job.agency_id, payload as { appointment_id: string });
          break;
        case 'appointment.no_show_followup':
          await processNoShowFollowup(svc, job.agency_id, payload as { appointment_id: string });
          break;
        case 'sla.recruiter_24h':
          await processSlaRecruiter24h(svc, job.agency_id, payload as { application_id: string });
          break;
        case 'sla.recruiter_48h':
          await processSlaRecruiter48h(svc, job.agency_id, payload as { application_id: string });
          break;
        case 'window.expiry':
          await processWindowExpiry(svc, job.agency_id, payload as { conversation_id: string });
          break;
        case 'documents.request':
          await processDocumentsRequest(svc, job.agency_id, payload as { application_id: string; stage_id: string });
          break;
        default:
          break;
      }
      await svc.from('scheduled_jobs')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('id', job.id);
      jobsProcessed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unbekannter Fehler';
      if (isDeadLetter(job.attempts)) {
        await svc.from('scheduled_jobs')
          .update({ status: 'dead', last_error: errorMsg, updated_at: new Date().toISOString() })
          .eq('id', job.id);

        // Admin-Benachrichtigung bei dead jobs (R1: Typ 'system')
        if (job.agency_id) {
          await createNotificationForAgency(svc, job.agency_id, {
            title: 'Geplanter Job fehlgeschlagen',
            body: `Job ${job.id} (${job.type}) ist nach 5 Versuchen gescheitert.`,
            type: 'system',
            push_url: '/settings',
          }).catch(() => {});
        }
      } else {
        // Retry mit Backoff
        const nextRun = new Date(Date.now() + getRetryDelay(job.attempts));
        await svc.from('scheduled_jobs')
          .update({
            status: 'pending',
            run_at: nextRun.toISOString(),
            last_error: errorMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', job.id);
      }
      jobsFailed++;
    }
  }

  return NextResponse.json({
    ok: true,
    events: { processed: eventsProcessed, failed: eventsFailed },
    jobs: { processed: jobsProcessed, failed: jobsFailed },
  });
}
