import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { fireEvent } from '@/lib/automations/fire';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { stage_id, rejection_reason } = await request.json();

  if (!stage_id) {
    return NextResponse.json({ error: 'stage_id erforderlich.' }, { status: 400 });
  }

  // Update candidate's current stage (+ Absagegrund, falls mitgeschickt)
  const updatePayload: Record<string, unknown> = { current_stage_id: stage_id };
  if (typeof rejection_reason === 'string' && rejection_reason.trim()) {
    updatePayload.rejection_reason = rejection_reason.trim();
    updatePayload.rejected_at = new Date().toISOString();
  }

  const { data: updated, error: updateError } = await supabase
    .from('candidates')
    .update(updatePayload)
    .eq('id', id)
    .select('id');

  if (updateError) {
    return NextResponse.json({ error: 'Update fehlgeschlagen.' }, { status: 500 });
  }
  // RLS kann still filtern: 0 betroffene Zeilen = kein Zugriff auf diesen Bewerber
  if (!updated?.length) {
    return NextResponse.json({ error: 'Kein Zugriff auf diesen Bewerber.' }, { status: 403 });
  }

  // Log the stage change
  await supabase.from('candidate_stages').insert({
    candidate_id: id,
    stage_id,
    changed_by: user.id,
  });

  // Get candidate's agency_id for automation
  const { data: candidate } = await supabase
    .from('candidates')
    .select('agency_id')
    .eq('id', id)
    .single();

  if (candidate) {
    fireEvent('stage_changed', candidate.agency_id, { candidate_id: id, extra: { new_stage_id: stage_id } }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
