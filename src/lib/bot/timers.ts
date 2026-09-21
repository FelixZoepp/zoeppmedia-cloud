/**
 * Timer-Helfer für den KI-Vorqualifizierungsbot (Phase 3, Task 6).
 * Legt bot.nudge / bot.timeout Jobs in scheduled_jobs an und kann
 * diese wieder auf 'cancelled' setzen wenn eine Antwort eingegangen ist.
 */

import { SupabaseClient } from '@supabase/supabase-js';

export async function armBotTimers(
  svc: SupabaseClient,
  args: { agencyId: string; conversationId: string; botStep: number }
): Promise<void> {
  const { agencyId, conversationId, botStep } = args;

  const nudgeRunAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString();
  const timeoutRunAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const payload = { conversation_id: conversationId, bot_step: botStep };

  await svc.from('scheduled_jobs').upsert(
    [
      {
        agency_id: agencyId,
        run_at: nudgeRunAt,
        type: 'bot.nudge',
        payload,
        status: 'pending',
        dedupe_key: `bot.nudge:${conversationId}:${botStep}`,
      },
      {
        agency_id: agencyId,
        run_at: timeoutRunAt,
        type: 'bot.timeout',
        payload,
        status: 'pending',
        dedupe_key: `bot.timeout:${conversationId}:${botStep}`,
      },
    ],
    { onConflict: 'dedupe_key', ignoreDuplicates: true }
  );
}

export async function cancelBotTimers(
  svc: SupabaseClient,
  args: { agencyId: string; conversationId: string }
): Promise<void> {
  const { agencyId, conversationId } = args;

  await svc
    .from('scheduled_jobs')
    .update({ status: 'cancelled' })
    .eq('agency_id', agencyId)
    .eq('status', 'pending')
    .in('type', ['bot.nudge', 'bot.nudge2', 'bot.timeout', 'bot.close'])
    .filter('payload->>conversation_id', 'eq', conversationId);
}

export async function armBotTimersV2(
  svc: SupabaseClient,
  args: { agencyId: string; conversationId: string; botStep: number },
): Promise<void> {
  const { agencyId, conversationId, botStep } = args;
  const payload = { conversation_id: conversationId, bot_step: botStep };

  const jobs = [
    { type: 'bot.nudge', runAt: 4 * 60 * 60_000, dedupe: `bot.nudge:${conversationId}:${botStep}` },
    { type: 'bot.nudge2', runAt: 24 * 60 * 60_000, dedupe: `bot.nudge2:${conversationId}:${botStep}` },
    { type: 'bot.timeout', runAt: 48 * 60 * 60_000, dedupe: `bot.timeout:${conversationId}:${botStep}` },
    { type: 'bot.close', runAt: 48 * 60 * 60_000, dedupe: `bot.close:${conversationId}:${botStep}` },
  ];

  await svc.from('scheduled_jobs').upsert(
    jobs.map(j => ({
      agency_id: agencyId,
      run_at: new Date(Date.now() + j.runAt).toISOString(),
      type: j.type,
      payload,
      status: 'pending' as const,
      dedupe_key: j.dedupe,
    })),
    { onConflict: 'dedupe_key', ignoreDuplicates: true },
  );
}
