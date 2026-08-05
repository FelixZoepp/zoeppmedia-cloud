import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: candidates } = await supabase
    .from('candidates')
    .select('*, current_stage:pipeline_stages(*)')
    .order('created_at', { ascending: false });

  return NextResponse.json(candidates);
}

export async function POST(request: Request) {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { name, email, phone, source } = await request.json();

  if (!name) {
    return NextResponse.json({ error: 'Name ist erforderlich.' }, { status: 400 });
  }

  // Get "Eingang" stage
  const { data: stage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .eq('sort_order', 1)
    .single();

  const { data: candidate, error } = await supabase
    .from('candidates')
    .insert({
      agency_id: profile.agency_id,
      name,
      email: email || null,
      phone: phone || null,
      source: source || 'manual',
      current_stage_id: stage!.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Bewerber konnte nicht erstellt werden.' }, { status: 500 });
  }

  // Log initial stage
  await supabase.from('candidate_stages').insert({
    candidate_id: candidate.id,
    stage_id: stage!.id,
    changed_by: user.id,
  });

  return NextResponse.json(candidate, { status: 201 });
}
