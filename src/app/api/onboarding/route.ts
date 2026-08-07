import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single();

  if (!profile?.agency_id) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const body = await req.json();

  const { data, error } = await supabase
    .from('onboarding_submissions')
    .insert({
      agency_id: profile.agency_id,
      status: 'completed',
      ...body,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update agency onboarding flag
  await supabase
    .from('agencies')
    .update({ onboarding_completed: true })
    .eq('id', profile.agency_id);

  // Auto-create fulfillment tasks
  const tasks = [
    { title: 'Perspective Funnel erstellen', task_type: 'perspective_funnel', sort_order: 1 },
    { title: 'Ad Copys generieren', task_type: 'ad_copy', sort_order: 2 },
    { title: 'Telefon-Skripte erstellen', task_type: 'script', sort_order: 3 },
    { title: 'Meta Kampagne vorbereiten', task_type: 'meta_campaign', sort_order: 4 },
  ];

  await supabase.from('fulfillment_tasks').insert(
    tasks.map((t) => ({ ...t, agency_id: profile.agency_id }))
  );

  return NextResponse.json(data);
}

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id, role')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let query = supabase.from('onboarding_submissions').select('*');

  if (profile.role !== 'admin' && profile.role !== 'employee') {
    query = query.eq('agency_id', profile.agency_id);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
