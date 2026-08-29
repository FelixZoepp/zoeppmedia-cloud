import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { logActivity } from '@/lib/activity/log';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);

  let query = supabase
    .from('project_tasks')
    .select('*, task_checkitems:project_task_checkitems(*), agencies:agency_id(id, name)')
    .order('reihenfolge', { ascending: true });

  // Scope by role
  if (isInternal(user.role)) {
    const agencyId = searchParams.get('agency_id');
    if (agencyId) query = query.eq('agency_id', agencyId);
  } else {
    if (!user.agency_id) return NextResponse.json({ error: 'Keine Agentur zugeordnet' }, { status: 403 });
    query = query.eq('agency_id', user.agency_id);
  }

  // Status filter
  const status = searchParams.get('status');
  if (status) query = query.eq('status', status);

  // Owner filter
  const owner = searchParams.get('owner');
  if (owner === 'me') {
    query = query.eq('owner_user_id', user.id);
  }

  // Due date filters
  const faellig = searchParams.get('faellig');
  if (faellig === 'heute') {
    const today = new Date().toISOString().split('T')[0];
    query = query.eq('faellig_am', today);
  } else if (faellig === 'ueberfaellig') {
    const today = new Date().toISOString().split('T')[0];
    query = query.lt('faellig_am', today).neq('status', 'erledigt').neq('status', 'nicht_noetig');
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isInternal(user.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { agency_id, titel, beschreibung, owner_user_id, faellig_am, checkliste } = body;

  if (!agency_id || !titel) {
    return NextResponse.json({ error: 'agency_id und titel sind Pflichtfelder' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Create the task
  const { data: task, error } = await supabase
    .from('project_tasks')
    .insert({
      agency_id,
      titel,
      beschreibung: beschreibung || null,
      owner_user_id: owner_user_id || null,
      faellig_am: faellig_am || null,
      status: 'offen',
      freigabe_noetig: false,
      reihenfolge: 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Create checkitems from checkliste array
  if (checkliste && Array.isArray(checkliste) && checkliste.length > 0) {
    const checkitems = checkliste.map((text: string, idx: number) => ({
      task_id: task.id,
      text,
      reihenfolge: idx + 1,
      erledigt: false,
    }));

    await supabase.from('project_task_checkitems').insert(checkitems);
  }

  await logActivity(supabase, {
    agency_id,
    user_id: user.id,
    action: `Aufgabe erstellt: ${titel}`,
    action_type: 'task_completed',
    metadata: { task_id: task.id },
  });

  // Return task with checkitems
  const { data: fullTask } = await supabase
    .from('project_tasks')
    .select('*, task_checkitems:project_task_checkitems(*), agencies:agency_id(id, name)')
    .eq('id', task.id)
    .single();

  return NextResponse.json(fullTask, { status: 201 });
}
