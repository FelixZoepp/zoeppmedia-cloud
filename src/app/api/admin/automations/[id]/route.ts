import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { logAudit, diffChanges } from '@/lib/audit/log';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: automation, error } = await supabase
    .from('automations')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !automation) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  // Fetch last 20 runs for this automation
  const { data: runs } = await supabase
    .from('automation_runs')
    .select('*')
    .eq('automation_id', id)
    .order('created_at', { ascending: false })
    .limit(20);

  return NextResponse.json({ automation, runs: runs ?? [] });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // Alte Version laden für diffChanges
  const { data: oldRow } = await supabase
    .from('automations')
    .select('name, active, trigger_event, actions, agency_id')
    .eq('id', id)
    .single();

  // Only allow updating specific fields
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updateData.name = body.name;
  if (body.description !== undefined) updateData.description = body.description;
  if (body.conditions !== undefined) updateData.conditions = body.conditions;
  if (body.actions !== undefined) updateData.actions = body.actions;
  if (body.delay_seconds !== undefined) updateData.delay_seconds = body.delay_seconds;
  if (body.active !== undefined) updateData.active = body.active;

  const { data, error } = await supabase
    .from('automations')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit-Log (best-effort)
  try {
    await logAudit(supabase, {
      agency_id: (oldRow?.agency_id ?? data?.agency_id) as string | null,
      user_id: user.id,
      entity_type: 'automation',
      entity_id: id,
      action: 'update',
      changes: oldRow && data
        ? diffChanges(
            oldRow as Record<string, unknown>,
            data as Record<string, unknown>,
            ['name', 'active', 'trigger_event', 'actions']
          )
        : undefined,
    });
  } catch (auditErr) {
    console.error('[audit] Automation PATCH log fehlgeschlagen:', auditErr);
  }

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Check if it's a system automation — those cannot be deleted
  const { data: automation } = await supabase
    .from('automations')
    .select('is_system, agency_id')
    .eq('id', id)
    .single();

  if (!automation) {
    return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  }

  if (automation.is_system) {
    return NextResponse.json(
      { error: 'System-Automatisierungen können nicht gelöscht werden.' },
      { status: 403 }
    );
  }

  const { error } = await supabase.from('automations').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Audit-Log (best-effort)
  try {
    await logAudit(supabase, {
      agency_id: automation.agency_id as string | null,
      user_id: user.id,
      entity_type: 'automation',
      entity_id: id,
      action: 'delete',
    });
  } catch (auditErr) {
    console.error('[audit] Automation DELETE log fehlgeschlagen:', auditErr);
  }

  return NextResponse.json({ ok: true });
}
