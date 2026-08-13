import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json() as {
    status?: string;
    notes?: string;
    assigned_to?: string | null;
  };

  const update: Record<string, unknown> = {};
  if (body.status !== undefined)      update.status      = body.status;
  if (body.notes !== undefined)       update.notes       = body.notes;
  if ('assigned_to' in body)          update.assigned_to = body.assigned_to;

  // Set completed_at when marking done, clear it otherwise
  if (body.status === 'done') {
    update.completed_at = new Date().toISOString();
  } else if (body.status && body.status !== 'done') {
    update.completed_at = null;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('playbook_tasks')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
