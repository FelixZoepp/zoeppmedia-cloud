import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: candidate } = await supabase
    .from('candidates')
    .select('*')
    .eq('id', id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const [{ data: stageHistory }, { data: notes }, { data: stages }] = await Promise.all([
    supabase
      .from('candidate_stages')
      .select('*, stage:pipeline_stages(*), user:users(name)')
      .eq('candidate_id', id)
      .order('changed_at', { ascending: true }),
    supabase
      .from('notes')
      .select('*, user:users(name)')
      .eq('candidate_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('pipeline_stages')
      .select('*')
      .order('sort_order'),
  ]);

  return NextResponse.json({ candidate, stageHistory, notes, stages });
}
