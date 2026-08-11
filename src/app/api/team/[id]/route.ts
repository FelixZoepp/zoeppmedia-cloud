import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Admins können Teammitglieder bearbeiten' }, { status: 403 });
  }

  const { name, position, agency_ids } = await req.json();

  const { data: member, error } = await supabase
    .from('team_members')
    .update({ name: name?.trim(), position: position?.trim() || null })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Rebuild assignments if provided
  let assignedAgencies: { id: string; name: string }[] = [];
  if (agency_ids !== undefined) {
    await supabase
      .from('employee_assignments')
      .delete()
      .eq('employee_id', member.user_id);

    if (agency_ids.length) {
      await supabase.from('employee_assignments').insert(
        agency_ids.map((agency_id: string) => ({ employee_id: member.user_id, agency_id }))
      );
      const { data: agData } = await supabase
        .from('agencies')
        .select('id, name')
        .in('id', agency_ids);
      assignedAgencies = agData || [];
    }
  }

  return NextResponse.json({ ...member, agencies: assignedAgencies });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Admins können Teammitglieder entfernen' }, { status: 403 });
  }

  // Get user_id first to delete assignments
  const { data: member } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('id', id)
    .single();

  if (member) {
    await supabase
      .from('employee_assignments')
      .delete()
      .eq('employee_id', member.user_id);
  }

  const { error } = await supabase.from('team_members').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
