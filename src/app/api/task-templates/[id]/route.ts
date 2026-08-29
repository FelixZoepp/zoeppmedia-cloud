import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('task_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !data) return NextResponse.json({ error: 'Template nicht gefunden' }, { status: 404 });

  return NextResponse.json(data);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const supabase = createAdminClient();

  const allowedFields = [
    'titel', 'prozess', 'beschreibung', 'owner_funktion', 'ausloeser',
    'sla_tage', 'checkliste', 'benoetigte_zugaenge', 'vorlagen_links',
    'definition_of_done', 'abgabe_typ', 'freigabe_noetig',
  ];

  const update: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (body[key] !== undefined) update[key] = body[key];
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Keine Aenderungen' }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('task_templates')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('task_templates')
    .update({ aktiv: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
