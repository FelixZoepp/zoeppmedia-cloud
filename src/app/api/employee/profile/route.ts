import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile, error } = await supabase
    .from('users')
    .select('id, name, email, role, position, avatar_url, calendly_link, phone')
    .eq('id', user.id)
    .single();

  if (error || !profile) {
    return NextResponse.json({ error: 'Profil nicht gefunden.' }, { status: 404 });
  }

  if (profile.role !== 'admin' && profile.role !== 'employee') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Get assigned agencies via employee_assignments -> team_members
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('user_id')
    .eq('user_id', user.id)
    .single();

  let agencies: { id: string; name: string }[] = [];
  if (teamMember) {
    const { data: assignments } = await supabase
      .from('employee_assignments')
      .select('agency_id, agencies:agency_id(id, name)')
      .eq('employee_id', user.id);

    agencies = (assignments ?? [])
      .map((a) => a.agencies as unknown as { id: string; name: string } | null)
      .filter((a): a is { id: string; name: string } => a !== null);
  }

  return NextResponse.json({ ...profile, agencies });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const { name, position, phone, calendly_link, avatar_url } = body;

  const updates: Record<string, string | null> = {};
  if (name !== undefined) updates.name = name;
  if (position !== undefined) updates.position = position;
  if (phone !== undefined) updates.phone = phone;
  if (calendly_link !== undefined) updates.calendly_link = calendly_link;
  if (avatar_url !== undefined) updates.avatar_url = avatar_url;

  const { error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Sync name/position to team_members if entry exists
  if (name !== undefined || position !== undefined) {
    const syncFields: Record<string, string | null> = {};
    if (name !== undefined) syncFields.name = name;
    if (position !== undefined) syncFields.position = position;
    await supabase
      .from('team_members')
      .update(syncFields)
      .eq('user_id', user.id);
  }

  return NextResponse.json({ ok: true });
}
