import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notifications/create';

/**
 * Cadence cron job — runs every 15 minutes.
 * Finds candidates with active cadence whose next attempt is due,
 * creates internal tasks, and sends notifications.
 *
 * Vercel Cron: GET /api/cron/cadence every 15 minutes
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const supabase = createAdminClient();
  const now = new Date().toISOString();

  // Find candidates with active cadence whose next attempt is due
  const { data: dueCandidates, error } = await supabase
    .from('candidates')
    .select('id, name, agency_id, cadence_attempt, cadence_next_window')
    .eq('cadence_active', true)
    .not('cadence_next_at', 'is', null)
    .lte('cadence_next_at', now);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let tasksCreated = 0;
  let notificationsSent = 0;

  for (const candidate of dueCandidates ?? []) {
    try {
      const attemptNumber = (candidate.cadence_attempt ?? 0) + 1;
      const windowLabel =
        candidate.cadence_next_window === 'morning'
          ? 'Vormittag'
          : candidate.cadence_next_window === 'afternoon'
            ? 'Nachmittag'
            : 'Abend';
      const isLastChance = attemptNumber === 6;

      // Create internal task
      await supabase.from('internal_tasks').insert({
        title: `Anrufversuch #${attemptNumber} ${isLastChance ? '(letzte Chance) ' : ''}— ${candidate.name}`,
        description: `Kadenz-Anruf im Zeitfenster: ${windowLabel}. ${isLastChance ? 'Letzter Versuch vor Kadenz-Ende.' : ''}`,
        agency_id: candidate.agency_id,
        status: 'todo',
        priority: isLastChance ? 'urgent' : 'high',
        due_date: now.split('T')[0],
        created_by: null,
      });
      tasksCreated++;

      // Clear cadence_next_at (waiting for call result to advance)
      await supabase
        .from('candidates')
        .update({ cadence_next_at: null })
        .eq('id', candidate.id);

      // Send notification to assigned employee (or first employee for this agency)
      const { data: employees } = await supabase
        .from('users')
        .select('id')
        .in('role', ['admin', 'employee'])
        .limit(5);

      if (employees?.length) {
        for (const employee of employees) {
          await createNotification(supabase, {
            user_id: employee.id,
            agency_id: candidate.agency_id,
            title: `Kadenz-Anruf fällig: ${candidate.name}`,
            body: `Anrufversuch #${attemptNumber} (${windowLabel})${isLastChance ? ' — Letzte Chance!' : ''}`,
            type: 'task_due',
            entity_type: 'candidate',
            entity_id: candidate.id,
          });
          notificationsSent++;
        }
      }
    } catch {
      // Continue with next candidate if one fails
    }
  }

  return NextResponse.json({
    ok: true,
    dueCandidates: dueCandidates?.length ?? 0,
    tasksCreated,
    notificationsSent,
  });
}
