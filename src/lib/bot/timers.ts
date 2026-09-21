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
    .in('type', ['bot.nudge', 'bot.timeout'])
    .filter('payload->>conversation_id', 'eq', conversationId);
}
