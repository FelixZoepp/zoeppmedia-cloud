import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { stage_id } = await request.json();

  if (!stage_id) {
    return NextResponse.json({ error: 'stage_id erforderlich.' }, { status: 400 });
  }

  // Update candidate's current stage
  const { error: updateError } = await supabase
    .from('candidates')
    .update({ current_stage_id: stage_id })
    .eq('id', id);

  if (updateError) {
    return NextResponse.json({ error: 'Update fehlgeschlagen.' }, { status: 500 });
  }

  // Log the stage change
  await supabase.from('candidate_stages').insert({
    candidate_id: id,
    stage_id,
    changed_by: user.id,
  });

  return NextResponse.json({ success: true });
}
