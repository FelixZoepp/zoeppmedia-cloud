import { SupabaseClient } from '@supabase/supabase-js';
import { sendPushToUsers } from '@/lib/push/send';

export type NotificationType =
  | 'new_candidate'
  | 'stage_change'
  | 'call_result'
  | 'task_assigned'
  | 'task_due'
  | 'sla_breach'
  | 'noshow'
  | 'opt_out'
  | 'system'
  | 'whatsapp_inbound';

interface CreateNotificationParams {
  user_id: string;
  agency_id?: string | null;
  title: string;
  body?: string;
  type: NotificationType;
  entity_type?: 'candidate' | 'task' | 'agency';
  entity_id?: string;
  /** Ziel-URL beim Klick auf die Push-Benachrichtigung */
  push_url?: string;
}

function pushUrlFor(params: Pick<CreateNotificationParams, 'push_url' | 'type'>): string {
  if (params.push_url) return params.push_url;
  if (params.type === 'new_candidate') return '/candidates';
  return '/dashboard';
}

export async function createNotification(supabase: SupabaseClient, params: CreateNotificationParams) {
  const { push_url, ...insertParams } = params;
  await supabase.from('notifications').insert(insertParams);
  await sendPushToUsers([params.user_id], {
    title: params.title,
    body: params.body,
    url: pushUrlFor({ push_url, type: params.type }),
  }).catch(() => {});
}

export async function createNotificationForAgency(
  supabase: SupabaseClient,
  agencyId: string,
  params: Omit<CreateNotificationParams, 'user_id' | 'agency_id'>
) {
  // Get all users in this agency
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .eq('agency_id', agencyId);

  if (!users?.length) return;

  const { push_url, ...insertParams } = params;
  const notifications = users.map(u => ({
    ...insertParams,
    user_id: u.id,
    agency_id: agencyId,
  }));

  await supabase.from('notifications').insert(notifications);
  await sendPushToUsers(users.map(u => u.id), {
    title: params.title,
    body: params.body,
    url: pushUrlFor({ push_url, type: params.type }),
  }).catch(() => {});
}

export async function createNotificationForInternals(
  supabase: SupabaseClient,
  params: Omit<CreateNotificationParams, 'user_id'>
) {
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .in('role', ['admin', 'employee']);

  if (!users?.length) return;

  const { push_url, ...insertParams } = params;
  const notifications = users.map(u => ({
    ...insertParams,
    user_id: u.id,
  }));

  await supabase.from('notifications').insert(notifications);
  await sendPushToUsers(users.map(u => u.id), {
    title: params.title,
    body: params.body,
    url: pushUrlFor({ push_url, type: params.type }),
  }).catch(() => {});
}
