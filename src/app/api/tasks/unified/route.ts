import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { searchParams } = request.nextUrl;

  const assignedTo = searchParams.get('assigned_to');
  const status = searchParams.get('status');
  const agencyId = searchParams.get('agency_id');
  const overdue = searchParams.get('overdue');
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);

  // Build query on the unified_tasks view
  let query = supabase
    .from('unified_tasks')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  // Scope by role: agency users only see their own agency's tasks
  if (!isInternal(user.role)) {
    if (!user.agency_id) {
      return NextResponse.json({ error: 'No agency assigned' }, { status: 403 });
    }
    query = query.eq('agency_id', user.agency_id);
  } else if (agencyId) {
    // Internal users can optionally filter by agency
    query = query.eq('agency_id', agencyId);
  }

  // Filter by assigned_to
  if (assignedTo === 'me') {
    query = query.eq('assigned_to', user.id);
  } else if (assignedTo) {
    query = query.eq('assigned_to', assignedTo);
  }

  // Filter by status
  if (status) {
    query = query.eq('status', status);
  }

  // Filter overdue tasks (have a due_date in the past)
  if (overdue === 'true') {
    query = query.lt('due_date', new Date().toISOString().split('T')[0]);
  }

  const { data: tasks, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enrich with SLA data for tasks that have an active SLA
  const taskIds = (tasks ?? []).map((t) => t.id);

  let slaMap: Record<string, { due_at: string; escalation_level: number }> = {};
  if (taskIds.length > 0) {
    const { data: slas } = await supabase
      .from('task_sla')
      .select('task_id, due_at, escalation_level')
      .in('task_id', taskIds)
      .is('resolved_at', null);

    for (const sla of slas ?? []) {
      slaMap[sla.task_id] = {
        due_at: sla.due_at,
        escalation_level: sla.escalation_level,
      };
    }
  }

  const enriched = (tasks ?? []).map((task) => ({
    ...task,
    sla: slaMap[task.id] ?? null,
  }));

  return NextResponse.json(enriched);
}
