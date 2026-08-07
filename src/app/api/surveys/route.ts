import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get('agency_id');

  // Get active templates
  const { data: templates } = await supabase
    .from('survey_templates')
    .select('*')
    .eq('active', true);

  // Get responses
  let responseQuery = supabase.from('survey_responses').select('*').order('created_at', { ascending: false });
  if (agencyId) responseQuery = responseQuery.eq('agency_id', agencyId);

  const { data: responses } = await responseQuery;

  return NextResponse.json({ templates: templates || [], responses: responses || [] });
}

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
    .from('survey_responses')
    .insert({
      template_id: body.template_id,
      agency_id: profile.agency_id,
      user_id: user.id,
      rating: body.rating,
      answers: body.answers || {},
      comment: body.comment || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
