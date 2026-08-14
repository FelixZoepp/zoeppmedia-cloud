import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { logActivity } from '@/lib/activity/log';

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = request.nextUrl;
  const limit = parseInt(searchParams.get('limit') ?? '50', 10);
  const offset = parseInt(searchParams.get('offset') ?? '0', 10);

  const { data: candidates, count } = await supabase
    .from('candidates')
    .select('*, current_stage:pipeline_stages(*)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // If pagination params were explicitly provided, return paginated shape
  if (searchParams.has('limit') || searchParams.has('offset')) {
    return NextResponse.json({ data: candidates, total: count ?? 0 });
  }

  // Backward-compatible: return plain array when no pagination params
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

  await logActivity(supabase, {
    agency_id: profile.agency_id,
    user_id: user.id,
    candidate_id: candidate.id,
    action: `Bewerber erstellt: ${candidate.name}`,
    action_type: 'candidate_created',
    metadata: { source: candidate.source },
  });

  return NextResponse.json(candidate, { status: 201 });
}
