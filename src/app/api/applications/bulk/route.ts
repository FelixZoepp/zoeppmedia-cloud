import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { logActivity } from '@/lib/activity/log';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const BulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['set_stage', 'assign', 'delete']),
  stage_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const body = await request.json();
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { ids, action, stage_id, assigned_to } = parsed.data;
  const supabase = await createServerClient();
  let affected = 0;

  if (action === 'set_stage' && stage_id) {
    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('id, stage_type, name')
      .eq('id', stage_id)
      .eq('agency_id', agencyId)
      .single();
    if (!stage) return NextResponse.json({ error: 'Stufe nicht gefunden' }, { status: 404 });

    let newStatus: string = 'open';
    if (stage.stage_type === 'hired') newStatus = 'hired';
    if (stage.stage_type === 'rejected') newStatus = 'rejected';

    for (const appId of ids) {
      const { data: app } = await supabase
        .from('applications')
        .select('candidate_id, stage_id')
        .eq('id', appId)
        .eq('agency_id', agencyId)
        .single();
      if (!app) continue;

      await supabase
        .from('applications')
        .update({ stage_id, status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', appId)
        .eq('agency_id', agencyId);
      await supabase.from('candidate_stages').insert({ candidate_id: app.candidate_id, stage_id, changed_by: user.id });
      await supabase.from('candidates').update({ current_stage_id: stage_id }).eq('id', app.candidate_id).eq('agency_id', agencyId);
      await logActivity(supabase, {
        agency_id: agencyId,
        user_id: user.id,
        candidate_id: app.candidate_id,
        action: `Stufe geaendert (Mehrfachaktion): ${stage.name}`,
        action_type: 'stage_change',
        metadata: { application_id: appId, old_stage_id: app.stage_id, new_stage_id: stage_id, bulk: true },
      });
      affected++;
    }
  } else if (action === 'assign') {
    for (const appId of ids) {
      const { error } = await supabase
        .from('applications')
        .update({ assigned_to: assigned_to ?? null, updated_at: new Date().toISOString() })
        .eq('id', appId)
        .eq('agency_id', agencyId);
      if (!error) affected++;
    }
  } else if (action === 'delete') {
    for (const appId of ids) {
      const { error } = await supabase
        .from('applications')
        .delete()
        .eq('id', appId)
        .eq('agency_id', agencyId);
      if (!error) affected++;
    }
  }

  return NextResponse.json({ affected });
}
