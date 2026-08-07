import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {
    status: body.status,
    updated_at: new Date().toISOString(),
  };

  if (body.status === 'done') updates.completed_at = new Date().toISOString();
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.assigned_to !== undefined) updates.assigned_to = body.assigned_to;

  const { data, error } = await supabase
    .from('customer_tasks')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log approval actions
  if (['waiting_approval', 'approved', 'changes_requested'].includes(body.status)) {
    const task = data as { agency_id: string };
    await supabase.from('approval_log').insert({
      agency_id: task.agency_id,
      item_type: 'task',
      item_id: id,
      action: body.status === 'waiting_approval' ? 'submitted' : body.status,
      comment: body.feedback || null,
      acted_by: user.id,
    });
  }

  return NextResponse.json(data);
}
