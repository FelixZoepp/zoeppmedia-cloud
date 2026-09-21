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
import { createNotificationForAgency } from '@/lib/notifications/create';

// Retry-Backoff in Minuten
const RETRY_DELAYS = [1, 5, 15, 60];

function getRetryDelay(attempts: number): number {
  const idx = Math.min(attempts - 1, RETRY_DELAYS.length - 1);
  return RETRY_DELAYS[idx] * 60 * 1000;
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET nicht konfiguriert' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const svc = createAdminClient();
  let eventsProcessed = 0;
  let eventsFailed = 0;
  let jobsProcessed = 0;
  let jobsFailed = 0;

  // 1. events_inbox abarbeiten
  const { data: events } = await svc.rpc('claim_inbox_events', { batch_size: 100 });

  for (const event of events || []) {
    try {
      const payload = event.payload as { type: string; [key: string]: unknown };
      switch (payload.type) {
        case 'whatsapp.inbound':
          await processInbound(svc, event.agency_id, payload as unknown as Parameters<typeof processInbound>[2]);
          break;
        case 'whatsapp.status':
          await processStatus(svc, payload as unknown as Parameters<typeof processStatus>[1]);
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
      if (event.attempts >= 5) {
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
        await svc.from('events_inbox')
          .update({ status: 'pending', error: errorMsg })
          .eq('id', event.id);
      }
      eventsFailed++;
    }
  }

  // 2. scheduled_jobs abarbeiten
  const { data: jobs } = await svc.rpc('claim_due_jobs', { batch_size: 100 });

  for (const job of jobs || []) {
    try {
      const payload = job.payload as { [key: string]: unknown };
      switch (job.type) {
        case 'whatsapp.send':
          await processSend(svc, payload as unknown as Parameters<typeof processSend>[1]);
          break;
        case 'media.download':
          await processMediaDownload(svc, job.agency_id, payload as unknown as Parameters<typeof processMediaDownload>[2]);
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
      if (job.attempts >= 5) {
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
