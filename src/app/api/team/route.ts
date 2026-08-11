import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabaseServer = supabase;
  const { data: members, error } = await supabaseServer
    .from('team_members')
    .select('*')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Load agency assignments for each member
  const result = [];
  for (const member of members || []) {
    const { data: assignments } = await supabaseServer
      .from('employee_assignments')
      .select('agency_id, agencies:agency_id(id, name)')
      .eq('employee_id', member.user_id);

    result.push({
      ...member,
      agencies: assignments?.map((a) => a.agencies).filter(Boolean) || [],
    });
  }

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Nur Admins können Teammitglieder anlegen' }, { status: 403 });
  }

  const { name, position, agency_ids } = await req.json();

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Name erforderlich' }, { status: 400 });
  }

  const { data: member, error } = await supabase
    .from('team_members')
    .insert({ user_id: user.id, name: name.trim(), position: position?.trim() || null })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let assignedAgencies: { id: string; name: string }[] = [];
  if (agency_ids?.length) {
    await supabase.from('employee_assignments').insert(
      agency_ids.map((agency_id: string) => ({ employee_id: member.user_id, agency_id }))
    );
    const { data: agData } = await supabase
      .from('agencies')
      .select('id, name')
      .in('id', agency_ids);
    assignedAgencies = agData || [];
  }

  return NextResponse.json({ ...member, agencies: assignedAgencies });
}
