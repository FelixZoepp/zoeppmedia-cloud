import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {
    ...body,
    updated_at: new Date().toISOString(),
  };

  if (body.status === 'approved') {
    updates.approved_by = user.id;
    updates.approved_at = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from('content_library')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log approval actions
  if (['pending_review', 'approved', 'changes_requested'].includes(body.status)) {
    const item = data as { agency_id: string };
    await supabase.from('approval_log').insert({
      agency_id: item.agency_id,
      item_type: 'content',
      item_id: id,
      action: body.status === 'pending_review' ? 'submitted' : body.status,
      comment: body.feedback || null,
      acted_by: user.id,
    });
  }

  return NextResponse.json(data);
}
