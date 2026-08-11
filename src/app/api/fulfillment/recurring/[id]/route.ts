import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const supabase = await createServerClient();

  const updateData: Record<string, unknown> = {};
  if (body.status) updateData.status = body.status;
  if (body.assigned_to !== undefined) updateData.assigned_to = body.assigned_to;
  if (body.status === 'done') updateData.completed_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('recurring_fulfillment_tasks')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
