import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';

/**
 * POST /api/tasks/complete
 *
 * 1-Klick-Erledigung für Aufgaben aus der unified_tasks-View (Heute-Seite).
 * Body: { task_id, task_source }
 *
 * task_source bestimmt die Zieltabelle:
 * - internal    → internal_tasks.status = 'done'
 * - fulfillment → fulfillment_tasks.status = 'done'
 * - playbook    → playbook_tasks.status = 'done'
 * - client      → client_tasks.completed = true
 * - recurring   → recurring_fulfillment_tasks.status = 'done'
 * - customer    → customer_tasks.status = 'done'
 * - callback    → call_logs.next_contact_date = null (Rückruf abgehakt)
 *
 * Offene SLAs zur Aufgabe werden mitaufgelöst.
 */

const now = () => new Date().toISOString();

const SOURCE_UPDATES: Record<
  string,
  { table: string; update: () => Record<string, unknown> }
> = {
  internal: { table: 'internal_tasks', update: () => ({ status: 'done', updated_at: now() }) },
  fulfillment: { table: 'fulfillment_tasks', update: () => ({ status: 'done', updated_at: now() }) },
  playbook: { table: 'playbook_tasks', update: () => ({ status: 'done', completed_at: now() }) },
  client: { table: 'client_tasks', update: () => ({ completed: true, completed_at: now() }) },
  recurring: { table: 'recurring_fulfillment_tasks', update: () => ({ status: 'done', completed_at: now() }) },
  customer: { table: 'customer_tasks', update: () => ({ status: 'done', completed_at: now(), updated_at: now() }) },
  callback: { table: 'call_logs', update: () => ({ next_contact_date: null }) },
};

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { task_id, task_source } = body as { task_id?: string; task_source?: string };

  if (!task_id || !isUuid(task_id) || !task_source || !SOURCE_UPDATES[task_source]) {
    return NextResponse.json(
      { error: 'task_id (UUID) und gültige task_source sind erforderlich' },
      { status: 400 }
    );
  }

  const { table, update } = SOURCE_UPDATES[task_source];
  const admin = createAdminClient();

  // Zeile laden für Berechtigungsprüfung (Agentur-Nutzer nur eigene Agentur)
  const { data: row } = await admin.from(table).select('id, agency_id').eq('id', task_id).maybeSingle();
  if (!row) return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });

  if (!isInternal(user.role) && row.agency_id !== user.agency_id) {
    return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 403 });
  }

  const { error } = await admin.from(table).update(update()).eq('id', task_id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Offene SLA zur Aufgabe auflösen
  if (task_source !== 'callback') {
    await admin
      .from('task_sla')
      .update({ resolved_at: now() })
      .eq('task_id', task_id)
      .is('resolved_at', null);
  }

  return NextResponse.json({ ok: true });
}
