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
    // Spalte heißt live „ablehngrund“ (rejection_reason/rejected_at gibt es in candidates nicht)
    updatePayload.ablehngrund = rejection_reason.trim();
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

  // Bewerbungen mitziehen, damit Kanban (applications.stage_id) und Bewerberakte nicht auseinanderlaufen
  if (candidate) {
    const { data: stage } = await supabase.from('pipeline_stages').select('stage_type, name').eq('id', stage_id).maybeSingle();
    const typ = (stage as { stage_type: string | null } | null)?.stage_type;
    // Ältere Stufen ohne stage_type erkennt man am Namen „Eingestellt“
    const eingestellt = typ === 'hired' || /^eingestellt/i.test((stage as { name?: string } | null)?.name ?? '');
    await supabase
      .from('applications')
      .update({
        stage_id,
        status: typ === 'hired' ? 'hired' : typ === 'rejected' ? 'rejected' : 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('candidate_id', id)
      .eq('agency_id', candidate.agency_id);
    // Einstellung: Datum merken (Basis für „Umsätze & ROI“), nur beim ersten Mal
    if (eingestellt) {
      await supabase.from('candidates').update({ eingestellt_am: new Date().toISOString() }).eq('id', id).is('eingestellt_am', null);
    }
  }

  if (candidate) {
    fireEvent('stage_changed', candidate.agency_id, { candidate_id: id, extra: { new_stage_id: stage_id } }).catch(() => {});
  }

  return NextResponse.json({ success: true });
}
