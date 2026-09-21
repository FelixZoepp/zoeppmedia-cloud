import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { logActivity } from '@/lib/activity/log';
import { logAudit } from '@/lib/audit/log';
import { fireEvent } from '@/lib/automations/fire';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const BulkSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(['set_stage', 'assign', 'delete']),
  stage_id: z.string().uuid().optional(),
  assigned_to: z.string().uuid().nullable().optional(),
  rejection_reason: z.string().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const body = await request.json();
  const parsed = BulkSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { ids, action, stage_id, assigned_to, rejection_reason } = parsed.data;
  const supabase = await createServerClient();
  let affected = 0;

  if (action === 'set_stage') {
    if (!stage_id) return NextResponse.json({ error: 'stage_id erforderlich' }, { status: 400 });

    const { data: stage } = await supabase
      .from('pipeline_stages')
      .select('id, stage_type, name')
      .eq('id', stage_id)
      .eq('agency_id', agencyId)
      .single();
    if (!stage) return NextResponse.json({ error: 'Stufe nicht gefunden' }, { status: 404 });

    // Absagegrund prüfen
    if (stage.stage_type === 'rejected' && !rejection_reason?.trim()) {
      return NextResponse.json({ error: 'Absagegrund erforderlich' }, { status: 400 });
    }

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

      const metadata: Record<string, unknown> = {
        application_id: appId,
        old_stage_id: app.stage_id,
        new_stage_id: stage_id,
        new_stage_name: stage.name,
        bulk: true,
      };
      if (rejection_reason) metadata.rejection_reason = rejection_reason;

      await logActivity(supabase, {
        agency_id: agencyId,
        user_id: user.id,
        candidate_id: app.candidate_id,
        action: `Stufe geaendert (Mehrfachaktion): ${stage.name}${rejection_reason ? ` (Grund: ${rejection_reason})` : ''}`,
        action_type: 'stage_change',
        metadata,
      });
      fireEvent('stage_changed', agencyId, {
        candidate_id: app.candidate_id,
        extra: { application_id: appId, new_stage_id: stage_id, new_stage_type: stage.stage_type },
      }).catch(() => {});
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
      if (!error) {
        affected++;
        await logAudit(supabase, {
          user_id: user.id,
          agency_id: agencyId,
          entity_type: 'application',
          entity_id: appId,
          action: 'delete',
        });
      }
    }
  }

  return NextResponse.json({ affected });
}
