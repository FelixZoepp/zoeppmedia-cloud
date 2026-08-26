import { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/create';

/**
 * Check for overdue SLAs and escalate.
 * Level 0: SLA set, not yet overdue
 * Level 1: Overdue > 2h  -> notify owner
 * Level 2: Overdue > 6h  -> notify teamlead/admin
 * Level 3: Overdue > 24h -> notify all admins (critical)
 */
export async function checkSlaEscalations(supabase: SupabaseClient) {
  const now = new Date();

  // Get all unresolved SLAs that are overdue
  const { data: overdueSlas } = await supabase
    .from('task_sla')
    .select('*')
    .is('resolved_at', null)
    .lt('due_at', now.toISOString())
    .order('due_at', { ascending: true });

  if (!overdueSlas?.length) return;

  for (const sla of overdueSlas) {
    const overdueMs = now.getTime() - new Date(sla.due_at).getTime();
    const overdueHours = overdueMs / (1000 * 60 * 60);

    let newLevel = 0;
    if (overdueHours >= 24) newLevel = 3;
    else if (overdueHours >= 6) newLevel = 2;
    else if (overdueHours >= 2) newLevel = 1;

    if (newLevel > sla.escalation_level) {
      // Update escalation level
      await supabase
        .from('task_sla')
        .update({
          escalation_level: newLevel,
          escalated_at: now.toISOString(),
        })
        .eq('id', sla.id);

      // Level 1: notify the assigned user
      if (newLevel === 1 && sla.assigned_to) {
        await createNotification(supabase, {
          user_id: sla.assigned_to,
          agency_id: sla.agency_id,
          title: 'Aufgabe überfällig',
          body: `Eine Aufgabe ist seit ${Math.round(overdueHours)} Stunden überfällig.`,
          type: 'sla_breach',
          entity_type: 'task',
          entity_id: sla.task_id,
        });
      }

      // Level 2+: notify all admins/employees
      if (newLevel >= 2) {
        const { data: admins } = await supabase
          .from('users')
          .select('id')
          .in('role', ['admin', 'employee']);

        for (const admin of admins ?? []) {
          await createNotification(supabase, {
            user_id: admin.id,
            agency_id: sla.agency_id,
            title:
              newLevel === 3
                ? 'Aufgabe kritisch überfällig (24h+)'
                : 'Aufgabe eskaliert (6h+)',
            body: `SLA-Verletzung Stufe ${newLevel}`,
            type: 'sla_breach',
            entity_type: 'task',
            entity_id: sla.task_id,
          });
        }
      }
    }
  }
}
