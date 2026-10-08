import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role, agency_id')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Kunden-Nutzer: eigenes Team (z. B. für die Bewerber-Zuweisung), gleiche Form wie team_members
  if (profile.role !== 'admin' && profile.role !== 'employee') {
    if (!profile.agency_id) return NextResponse.json([]);
    // RLS zeigt Kunden nur die eigene Zeile → nach Prüfung der Agentur per Service-Client lesen
    const { data: kollegen } = await createAdminClient().from('users').select('id, name').eq('agency_id', profile.agency_id).order('name');
    return NextResponse.json((kollegen ?? []).map((k) => ({ id: k.id, user_id: k.id, name: k.name, agencies: [] })));
  }

  const supabaseServer = supabase;
  const { data: members, error } = await supabaseServer
    .from('team_members')
    .select('*')
    .order('name');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Zuweisungen aller Mitglieder in einer Abfrage laden und zuordnen
  const userIds = [...new Set((members || []).map((m) => m.user_id).filter(Boolean))];
  const { data: assignments } = userIds.length
    ? await supabaseServer
        .from('employee_assignments')
        .select('employee_id, agency_id, agencies:agency_id(id, name)')
        .in('employee_id', userIds)
    : { data: [] };
  const proMitglied = new Map<string, unknown[]>();
  for (const a of assignments ?? []) {
    if (!a.agencies) continue;
    const liste = proMitglied.get(a.employee_id) ?? [];
    liste.push(a.agencies);
    proMitglied.set(a.employee_id, liste);
  }
  const result = (members || []).map((member) => ({
    ...member,
    agencies: proMitglied.get(member.user_id) ?? [],
  }));

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
