import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logActivity } from '@/lib/activity/log';

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
  const admin = createAdminClient();

  // Check if a draft already exists — update it instead of inserting
  const { data: existing } = await admin
    .from('onboarding_submissions')
    .select('id')
    .eq('agency_id', profile.agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  let data;
  let error;

  if (existing) {
    // Update existing draft to completed
    const result = await admin
      .from('onboarding_submissions')
      .update({ ...body, status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', existing.id)
      .select()
      .single();
    data = result.data;
    error = result.error;
  } else {
    // Create new submission
    const result = await admin
      .from('onboarding_submissions')
      .insert({ agency_id: profile.agency_id, status: 'completed', ...body })
      .select()
      .single();
    data = result.data;
    error = result.error;
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update agency onboarding flag using admin client (bypasses RLS)
  await admin
    .from('agencies')
    .update({
      onboarding_completed: true,
      has_video_shoot: body.has_video_shoot || false,
      reels_per_month: body.reels_per_month || 0,
    })
    .eq('id', profile.agency_id);

  // Auto-create fulfillment tasks
  const fulfillmentTasks = [
    { title: 'Ad Copys generieren', task_type: 'ad_copy', sort_order: 1 },
    { title: 'Telefon-Skripte generieren', task_type: 'phone_script', sort_order: 2 },
    { title: 'Video-Skripte generieren', task_type: 'video_script', sort_order: 3 },
    { title: 'Stellenanzeigen generieren', task_type: 'job_posting', sort_order: 4 },
    { title: 'Creative Brief generieren', task_type: 'creative_brief', sort_order: 5 },
    { title: 'Perspective Funnel erstellen', task_type: 'perspective_funnel', sort_order: 6 },
    { title: 'Meta Zugang verifizieren', task_type: 'manual', sort_order: 7 },
    { title: 'Meta Kampagne hochladen', task_type: 'meta_upload', sort_order: 8 },
    { title: 'Indeed Texte einpflegen', task_type: 'manual', sort_order: 9 },
    { title: 'Funnel veröffentlichen', task_type: 'funnel_publish', sort_order: 10 },
  ];

  // Only create tasks if they don't exist yet
  const { data: existingTasks } = await admin
    .from('fulfillment_tasks')
    .select('id')
    .eq('agency_id', profile.agency_id)
    .limit(1);

  if (!existingTasks?.length) {
    await admin.from('fulfillment_tasks').insert(
      fulfillmentTasks.map((t) => ({
        agency_id: profile.agency_id,
        title: t.title,
        task_type: t.task_type,
        status: 'pending',
        sort_order: t.sort_order,
      }))
    );
  }

  // Log activity
  await logActivity(admin, {
    agency_id: profile.agency_id,
    user_id: user.id,
    action: 'Onboarding abgeschlossen',
    action_type: 'onboarding_complete',
  });

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
