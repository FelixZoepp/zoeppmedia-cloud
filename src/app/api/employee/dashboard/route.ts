import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();

  // Get employee assignments -> agency_ids
  const { data: assignments } = await supabase
    .from('employee_assignments')
    .select('agency_id')
    .eq('employee_id', user.id);

  const agencyIds = (assignments ?? []).map((a) => a.agency_id);

  // Get agency details for assigned agencies
  let agencies: { id: string; name: string; contact_name: string; email: string }[] = [];
  if (agencyIds.length > 0) {
    const { data } = await supabase
      .from('agencies')
      .select('id, name, contact_name, email')
      .in('id', agencyIds);
    agencies = data ?? [];
  }

  // Get internal tasks assigned to user that are not done
  const { data: tasks } = await supabase
    .from('internal_tasks')
    .select('id, title, description, agency_id, status, priority, due_date')
    .eq('assigned_to', user.id)
    .neq('status', 'done')
    .order('due_date', { ascending: true });

  // Get agency names for tasks
  const taskAgencyIds = [...new Set((tasks ?? []).map((t) => t.agency_id).filter(Boolean))] as string[];
  let taskAgencyNames: Record<string, string> = {};
  if (taskAgencyIds.length > 0) {
    const { data } = await supabase
      .from('agencies')
      .select('id, name')
      .in('id', taskAgencyIds);
    (data ?? []).forEach((a) => { taskAgencyNames[a.id] = a.name; });
  }

  const tasksWithAgency = (tasks ?? []).map((t) => ({
    ...t,
    agency_name: t.agency_id ? taskAgencyNames[t.agency_id] ?? 'Unbekannt' : null,
  }));

  // Get recurring fulfillment tasks for assigned agencies with status pending
  let fulfillmentTasks: {
    id: string;
    agency_id: string;
    task_key: string;
    title: string;
    status: string;
    due_date: string | null;
    agency_name?: string;
  }[] = [];
  if (agencyIds.length > 0) {
    const { data } = await supabase
      .from('recurring_fulfillment_tasks')
      .select('id, agency_id, task_key, title, status, due_date')
      .in('agency_id', agencyIds)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });
    fulfillmentTasks = (data ?? []).map((t) => ({
      ...t,
      agency_name: agencies.find((a) => a.id === t.agency_id)?.name ?? 'Unbekannt',
    }));
  }

  return NextResponse.json({
    user: { name: user.name, role: user.role },
    agencies,
    tasks: tasksWithAgency,
    fulfillmentTasks,
  });
}
