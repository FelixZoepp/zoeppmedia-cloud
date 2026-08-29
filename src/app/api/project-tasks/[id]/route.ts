import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createNotification } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';
import type { ProjectTaskStatus } from '@/lib/types/database';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: task, error } = await supabase
    .from('project_tasks')
    .select('*, task_checkitems:project_task_checkitems(*), agencies:agency_id(id, name), task_templates:template_id(*)')
    .eq('id', id)
    .single();

  if (error || !task) return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });

  // Scope check for agency users
  if (!isInternal(user.role) && task.agency_id !== user.agency_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Get access items for this agency if task has template with benoetigte_zugaenge
  let accessItems = null;
  if (task.task_templates?.benoetigte_zugaenge?.length) {
    const { data } = await supabase
      .from('access_items')
      .select('*')
      .eq('agency_id', task.agency_id)
      .in('typ', task.task_templates.benoetigte_zugaenge);
    accessItems = data;
  }

  // Get client_profile if available
  const { data: clientProfile } = await supabase
    .from('client_profiles')
    .select('*')
    .eq('agency_id', task.agency_id)
    .maybeSingle();

  return NextResponse.json({ ...task, access_items: accessItems, client_profile: clientProfile });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  // Fetch existing task with checkitems
  const { data: task, error: fetchError } = await supabase
    .from('project_tasks')
    .select('*, task_checkitems:project_task_checkitems(*)')
    .eq('id', id)
    .single();

  if (fetchError || !task) return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });

  // Scope check
  if (!isInternal(user.role) && task.agency_id !== user.agency_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const update: Record<string, unknown> = {};

  // Handle status transitions
  if (body.status && body.status !== task.status) {
    const newStatus: ProjectTaskStatus = body.status;
    const oldStatus: ProjectTaskStatus = task.status;

    const checkitems = task.task_checkitems || [];
    const allChecksDone = checkitems.length === 0 || checkitems.every((c: { erledigt: boolean }) => c.erledigt);
    const hasErgebnis = !!(task.ergebnis_url || task.ergebnis_text || body.ergebnis_url || body.ergebnis_text);

    // Validate transitions
    if (oldStatus === 'offen' && newStatus === 'in_arbeit') {
      update.gestartet_am = new Date().toISOString();
    } else if (oldStatus === 'in_arbeit' && newStatus === 'zur_freigabe') {
      if (!task.freigabe_noetig) {
        return NextResponse.json({ error: 'Aufgabe erfordert keine Freigabe' }, { status: 400 });
      }
      if (!allChecksDone) {
        return NextResponse.json({ error: 'Alle Checkitems muessen erledigt sein' }, { status: 400 });
      }
      if (!hasErgebnis) {
        return NextResponse.json({ error: 'Ein Ergebnis (URL oder Text) ist erforderlich' }, { status: 400 });
      }
    } else if (oldStatus === 'in_arbeit' && newStatus === 'erledigt') {
      if (task.freigabe_noetig) {
        return NextResponse.json({ error: 'Diese Aufgabe erfordert eine Freigabe vor dem Abschliessen' }, { status: 400 });
      }
      if (!allChecksDone) {
        return NextResponse.json({ error: 'Alle Checkitems muessen erledigt sein' }, { status: 400 });
      }
      if (!hasErgebnis) {
        return NextResponse.json({ error: 'Ein Ergebnis (URL oder Text) ist erforderlich' }, { status: 400 });
      }
      update.erledigt_am = new Date().toISOString();
    } else if (oldStatus === 'zur_freigabe' && newStatus === 'erledigt') {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Nur Admins koennen Aufgaben freigeben' }, { status: 403 });
      }
      update.erledigt_am = new Date().toISOString();
    } else if (oldStatus === 'zur_freigabe' && newStatus === 'in_arbeit') {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Nur Admins koennen Aufgaben zurueckweisen' }, { status: 403 });
      }
      // Notify owner about rejection
      if (task.owner_user_id) {
        await createNotification(supabase, {
          user_id: task.owner_user_id,
          agency_id: task.agency_id,
          title: 'Aufgabe zurueckgewiesen',
          body: `Die Aufgabe "${task.titel}" wurde zurueckgewiesen. ${body.notiz ? 'Grund: ' + body.notiz : ''}`,
          type: 'task_assigned',
          entity_type: 'task',
          entity_id: task.id,
        });
      }
    } else if (newStatus === 'nicht_noetig') {
      if (user.role !== 'admin') {
        return NextResponse.json({ error: 'Nur Admins koennen Aufgaben als nicht noetig markieren' }, { status: 403 });
      }
      if (!body.notiz) {
        return NextResponse.json({ error: 'Eine Notiz ist erforderlich wenn als nicht noetig markiert wird' }, { status: 400 });
      }
    } else {
      return NextResponse.json({ error: `Ungueltige Statusaenderung von ${oldStatus} zu ${newStatus}` }, { status: 400 });
    }

    update.status = newStatus;
  }

  // Allow updating these fields
  if (body.ergebnis_url !== undefined) update.ergebnis_url = body.ergebnis_url;
  if (body.ergebnis_text !== undefined) update.ergebnis_text = body.ergebnis_text;
  if (body.notiz !== undefined) update.notiz = body.notiz;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Keine Aenderungen' }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const { data: updated, error: updateError } = await supabase
    .from('project_tasks')
    .update(update)
    .eq('id', id)
    .select('*, task_checkitems:project_task_checkitems(*), agencies:agency_id(id, name)')
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  // When task is completed: unblock dependent tasks
  if (update.status === 'erledigt' || update.status === 'nicht_noetig') {
    // Find all tasks that have this task ID in blockiert_durch
    const { data: blockedTasks } = await supabase
      .from('project_tasks')
      .select('id, blockiert_durch, status')
      .contains('blockiert_durch', [id]);

    if (blockedTasks && blockedTasks.length > 0) {
      for (const blocked of blockedTasks) {
        const newBlockedBy = (blocked.blockiert_durch as string[]).filter((bid: string) => bid !== id);
        const newUpdate: Record<string, unknown> = {
          blockiert_durch: newBlockedBy.length > 0 ? newBlockedBy : null,
          updated_at: new Date().toISOString(),
        };
        // If no more blockers, set to offen
        if (newBlockedBy.length === 0 && blocked.status === 'blockiert') {
          newUpdate.status = 'offen';
        }
        await supabase.from('project_tasks').update(newUpdate).eq('id', blocked.id);
      }
    }

    await logActivity(supabase, {
      agency_id: task.agency_id,
      user_id: user.id,
      action: `Aufgabe ${update.status === 'erledigt' ? 'erledigt' : 'als nicht noetig markiert'}: ${task.titel}`,
      action_type: 'task_completed',
      metadata: { task_id: id, status: update.status },
    });
  }

  return NextResponse.json(updated);
}
