import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isInternal } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: taskId } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  // Verify user has access to this task
  const { data: task } = await supabase
    .from('project_tasks')
    .select('agency_id')
    .eq('id', taskId)
    .single();

  if (!task) return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });

  if (!isInternal(user.role) && task.agency_id !== user.agency_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { checkitem_id, erledigt } = body;

  if (!checkitem_id || typeof erledigt !== 'boolean') {
    return NextResponse.json({ error: 'checkitem_id und erledigt sind Pflichtfelder' }, { status: 400 });
  }

  // Verify checkitem belongs to this task
  const { data: checkitem } = await supabase
    .from('project_task_checkitems')
    .select('id, task_id')
    .eq('id', checkitem_id)
    .eq('task_id', taskId)
    .single();

  if (!checkitem) return NextResponse.json({ error: 'Checkitem nicht gefunden' }, { status: 404 });

  const update: Record<string, unknown> = { erledigt };
  if (erledigt) {
    update.erledigt_von = user.id;
    update.erledigt_am = new Date().toISOString();
  } else {
    update.erledigt_von = null;
    update.erledigt_am = null;
  }

  const { data, error } = await supabase
    .from('project_task_checkitems')
    .update(update)
    .eq('id', checkitem_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
