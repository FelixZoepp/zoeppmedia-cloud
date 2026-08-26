import { SupabaseClient } from '@supabase/supabase-js';

export type NotificationType =
  | 'new_candidate'
  | 'stage_change'
  | 'call_result'
  | 'task_assigned'
  | 'task_due'
  | 'sla_breach'
  | 'noshow'
  | 'opt_out'
  | 'system';

interface CreateNotificationParams {
  user_id: string;
  agency_id?: string | null;
  title: string;
  body?: string;
  type: NotificationType;
  entity_type?: 'candidate' | 'task' | 'agency';
  entity_id?: string;
}

export async function createNotification(supabase: SupabaseClient, params: CreateNotificationParams) {
  await supabase.from('notifications').insert(params);
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

  const notifications = users.map(u => ({
    ...params,
    user_id: u.id,
    agency_id: agencyId,
  }));

  await supabase.from('notifications').insert(notifications);
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

  const notifications = users.map(u => ({
    ...params,
    user_id: u.id,
  }));

  await supabase.from('notifications').insert(notifications);
}
