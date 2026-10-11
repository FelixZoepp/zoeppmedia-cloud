/**
 * Betriebsalarm an alle Admins (Glocke + Push), gedrosselt: derselbe Alarm höchstens alle 6 Stunden.
 * Für Probleme, die sonst still bleiben würden (z. B. Bewerber-Eingang kaputt).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export async function alarmAnAdmins(svc: SupabaseClient, alarm: { titel: string; text: string; link?: string; agencyId?: string | null }): Promise<boolean> {
  const seit = new Date(Date.now() - 6 * 3600_000).toISOString();
  const { count } = await svc.from('notifications').select('id', { count: 'exact', head: true }).eq('title', alarm.titel).gte('created_at', seit);
  if (count) return false;
  const { data: admins } = await svc.from('users').select('id').eq('role', 'admin');
  const { createNotification } = await import('@/lib/notifications/create');
  for (const a of (admins ?? []) as Array<{ id: string }>) {
    await createNotification(svc, {
      user_id: a.id,
      agency_id: alarm.agencyId ?? undefined,
      title: alarm.titel,
      body: alarm.text.slice(0, 300),
      type: 'system',
      push_url: alarm.link ?? '/admin/health',
    }).catch(() => {});
  }
  return true;
}
