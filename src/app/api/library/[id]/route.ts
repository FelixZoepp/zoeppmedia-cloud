import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { logActivity } from '@/lib/activity/log';

const validTransitions: Record<string, string[]> = {
  draft:             ['internal_review'],
  internal_review:   ['approved_internal', 'draft'],
  approved_internal: ['client_review', 'internal_review'],
  client_review:     ['approved', 'changes_requested'],
  approved:          ['deployed'],
  changes_requested: ['internal_review', 'approved_internal'],
  deployed:          ['archived'],
  archived:          [],
};

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const body = await req.json();

  // Fetch current item to validate the transition
  const { data: existing, error: fetchError } = await supabase
    .from('content_library')
    .select('status, agency_id, content_type')
    .eq('id', id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: 'Content not found' }, { status: 404 });
  }

  // Enforce valid status transitions when a status change is requested
  if (body.status !== undefined) {
    const currentStatus: string = existing.status;
    const nextStatus: string = body.status;

    if (currentStatus !== nextStatus) {
      const allowed = validTransitions[currentStatus] ?? [];
      if (!allowed.includes(nextStatus)) {
        return NextResponse.json(
          { error: `Invalid status transition: ${currentStatus} → ${nextStatus}` },
          { status: 400 },
        );
      }
    }
  }

  const updates: Record<string, unknown> = {
    ...body,
    updated_at: new Date().toISOString(),
  };

  // Track who approved / when
  if (body.status === 'approved' || body.status === 'approved_internal') {
    updates.approved_by = currentUser.id;
    updates.approved_at = new Date().toISOString();
  }

  // Store client feedback in the dedicated column
  if (body.client_feedback !== undefined) {
    updates.client_feedback = body.client_feedback;
  }

  const { data, error } = await supabase
    .from('content_library')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Log content approval / rejection to activity_log
  if (body.status && body.status !== existing.status) {
    const isApproval = body.status === 'approved' || body.status === 'approved_internal';
    const isRejection = body.status === 'changes_requested';
    if (isApproval || isRejection) {
      await logActivity(supabase, {
        agency_id: existing.agency_id,
        user_id: currentUser.id,
        action: isApproval
          ? `Inhalt freigegeben (${body.status})`
          : `Änderungen angefordert`,
        action_type: isApproval ? 'content_approval' : 'content_rejection',
        metadata: { content_id: id, from_status: existing.status, to_status: body.status },
      });
    }
  }

  // When client approves content → mark the matching fulfillment task as done
  if (body.status === 'approved' && existing.agency_id) {
    // Map content_type to fulfillment task_type
    const contentToTaskType: Record<string, string> = {
      ad_copy: 'ad_copy',
      funnel_text: 'funnel_text',
      job_posting: 'job_posting',
      video_script: 'video_script',
      creative_brief: 'creative_brief',
      phone_script: 'phone_script',
    };
    const taskType = contentToTaskType[existing.content_type];
    if (taskType) {
      await supabase
        .from('fulfillment_tasks')
        .update({ status: 'done', updated_at: new Date().toISOString() })
        .eq('agency_id', existing.agency_id)
        .eq('task_type', taskType)
        .neq('status', 'done');
    }
  }

  // Log all meaningful status transitions to approval_log
  const statusToAction: Record<string, string> = {
    internal_review:   'submitted',
    approved_internal: 'approved',
    client_review:     'submitted',
    approved:          'approved',
    changes_requested: 'changes_requested',
    approved_internal_resubmit: 'resubmitted',
  };

  if (body.status && body.status !== existing.status) {
    const action = statusToAction[body.status] ?? body.status;
    const isResubmit =
      body.status === 'approved_internal' && existing.status === 'changes_requested';

    await supabase.from('approval_log').insert({
      agency_id: existing.agency_id,
      item_type: 'content',
      item_id: id,
      action: isResubmit ? 'resubmitted' : action,
      comment: body.client_feedback || body.feedback || null,
      acted_by: currentUser.id,
    });
  }

  return NextResponse.json(data);
}
