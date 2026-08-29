import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);

  let query = supabase
    .from('task_templates')
    .select('*')
    .eq('aktiv', true)
    .order('titel', { ascending: true });

  const prozess = searchParams.get('prozess');
  if (prozess) query = query.eq('prozess', prozess);

  const ausloeser = searchParams.get('ausloeser');
  if (ausloeser) query = query.eq('ausloeser', ausloeser);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await request.json();
  const { titel, prozess, beschreibung, owner_funktion, ausloeser, sla_tage, checkliste, benoetigte_zugaenge, vorlagen_links, definition_of_done, abgabe_typ, freigabe_noetig } = body;

  if (!titel) {
    return NextResponse.json({ error: 'titel ist ein Pflichtfeld' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('task_templates')
    .insert({
      titel,
      prozess: prozess || null,
      beschreibung: beschreibung || null,
      owner_funktion: owner_funktion || null,
      ausloeser: ausloeser || null,
      sla_tage: sla_tage || null,
      checkliste: checkliste || null,
      benoetigte_zugaenge: benoetigte_zugaenge || null,
      vorlagen_links: vorlagen_links || null,
      definition_of_done: definition_of_done || null,
      abgabe_typ: abgabe_typ || null,
      freigabe_noetig: freigabe_noetig ?? false,
      aktiv: true,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
