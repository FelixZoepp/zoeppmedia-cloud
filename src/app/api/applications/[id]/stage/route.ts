import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { logActivity } from '@/lib/activity/log';
import { logAudit } from '@/lib/audit/log';
import { fireEvent } from '@/lib/automations/fire';
import { scheduleStageReminders } from '@/lib/workers/sla-reminders';
import { NextRequest, NextResponse } from 'next/server';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const body = await request.json();
  const { stage_id, rejection_reason } = body;
  if (!stage_id) return NextResponse.json({ error: 'stage_id erforderlich' }, { status: 400 });

  const supabase = await createServerClient();

  // Hole aktuelle application + neue Stufe
  const { data: app } = await supabase
    .from('applications')
    .select('id, candidate_id, stage_id, agency_id')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single();

  if (!app) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const { data: newStage } = await supabase
    .from('pipeline_stages')
    .select('id, stage_type, name, requires_documents')
    .eq('id', stage_id)
    .eq('agency_id', agencyId)
    .single();

  if (!newStage) return NextResponse.json({ error: 'Stufe nicht gefunden' }, { status: 404 });

  // Absagegrund prüfen
  if (newStage.stage_type === 'rejected' && !rejection_reason?.trim()) {
    return NextResponse.json({ error: 'Absagegrund erforderlich' }, { status: 400 });
  }

  // Status ableiten
  let newStatus: string = 'open';
  if (newStage.stage_type === 'hired') newStatus = 'hired';
  if (newStage.stage_type === 'rejected') newStatus = 'rejected';

  // Application aktualisieren
  const { error: updateError } = await supabase
    .from('applications')
    .update({
      stage_id,
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('agency_id', agencyId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // SLA- und Dokumente-Reminder planen (best effort)
  scheduleStageReminders(supabase, agencyId, id, stage_id, newStage.stage_type, newStage.requires_documents ?? false)
    .catch((e) => console.error('scheduleStageReminders fehlgeschlagen', e));

  // candidate_stages (Bestandskompatibilitaet R5)
  await supabase.from('candidate_stages').insert({
    candidate_id: app.candidate_id,
    stage_id,
    changed_by: user.id,
  });

  // Auch candidates.current_stage_id aktualisieren (Bestandskompatibilitaet)
  await supabase
    .from('candidates')
    .update({ current_stage_id: stage_id })
    .eq('id', app.candidate_id)
    .eq('agency_id', agencyId);

  // activity_log (application-bezogen)
  const metadata: Record<string, unknown> = {
    application_id: id,
    old_stage_id: app.stage_id,
    new_stage_id: stage_id,
    new_stage_name: newStage.name,
    changed_by: user.id,
  };
  if (rejection_reason) metadata.rejection_reason = rejection_reason;

  await logActivity(supabase, {
    agency_id: agencyId,
    user_id: user.id,
    candidate_id: app.candidate_id,
    action: `Stufe geaendert: ${newStage.name}${rejection_reason ? ` (Grund: ${rejection_reason})` : ''}`,
    action_type: 'stage_change',
    metadata,
  });

  // Automation
  fireEvent('stage_changed', agencyId, {
    candidate_id: app.candidate_id,
    extra: { application_id: id, new_stage_id: stage_id, new_stage_type: newStage.stage_type },
  }).catch(() => {});

  return NextResponse.json({ success: true });
}
