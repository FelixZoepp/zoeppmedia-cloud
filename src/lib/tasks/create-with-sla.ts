import { SupabaseClient } from '@supabase/supabase-js';

interface CreateSlaTaskParams {
  task_source: string;
  task_id: string;
  agency_id?: string | null;
  candidate_id?: string | null;
  assigned_to?: string | null;
  sla_minutes: number;
}

export async function createTaskSla(
  supabase: SupabaseClient,
  params: CreateSlaTaskParams
) {
  const dueAt = new Date(Date.now() + params.sla_minutes * 60 * 1000);

  await supabase.from('task_sla').insert({
    task_source: params.task_source,
    task_id: params.task_id,
    agency_id: params.agency_id ?? null,
    candidate_id: params.candidate_id ?? null,
    assigned_to: params.assigned_to ?? null,
    sla_minutes: params.sla_minutes,
    due_at: dueAt.toISOString(),
  });
}

export async function resolveTaskSla(
  supabase: SupabaseClient,
  taskSource: string,
  taskId: string
) {
  await supabase
    .from('task_sla')
    .update({ resolved_at: new Date().toISOString() })
    .eq('task_source', taskSource)
    .eq('task_id', taskId)
    .is('resolved_at', null);
}
