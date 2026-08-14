import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Save onboarding draft — upserts without setting onboarding_completed
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

  // Check if draft already exists
  const { data: existing } = await supabase
    .from('onboarding_submissions')
    .select('id')
    .eq('agency_id', profile.agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (existing) {
    // Update existing draft
    const { error } = await supabase
      .from('onboarding_submissions')
      .update({ ...body, status: 'in_progress', updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    // Create new draft
    const { error } = await supabase
      .from('onboarding_submissions')
      .insert({ agency_id: profile.agency_id, status: 'in_progress', ...body });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

// Load existing draft
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single();

  if (!profile?.agency_id) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const { data } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('agency_id', profile.agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return NextResponse.json(data || null);
}
