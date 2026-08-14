import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextResponse } from 'next/server';
import { logActivity } from '@/lib/activity/log';
import { generateContent, type OnboardingContext } from '@/lib/ai/claude';

// Auto-generate all content types after onboarding completes
async function autoGenerateContent(agencyId: string, onboarding: Record<string, unknown>) {
  const admin = createAdminClient();

  const ctx: OnboardingContext = {
    company_name: (onboarding.company_name as string) || null,
    industry: (onboarding.industry as string) || null,
    region: (onboarding.region as string) || null,
    employee_count: (onboarding.employee_count as string) || null,
    hiring_target: (onboarding.hiring_target as number) || null,
    hiring_timeframe: (onboarding.hiring_timeframe as string) || null,
    experience_required: (onboarding.experience_required as string) || null,
    compensation_model: (onboarding.compensation_model as string) || null,
    usps: (onboarding.usps as string) || null,
    primary_color: (onboarding.primary_color as string) || null,
    job_title: (onboarding.job_title as string) || null,
    regions: (onboarding.regions as string[]) || null,
    radius_km: (onboarding.radius_km as number) || null,
    product: (onboarding.product as string) || null,
    task_type: (onboarding.task_type as string) || null,
    compensation: (onboarding.compensation as string) || null,
    commission_per_unit: (onboarding.commission_per_unit as string) || null,
    monthly_earning_from: (onboarding.monthly_earning_from as number) || null,
    monthly_earning_to: (onboarding.monthly_earning_to as number) || null,
    employment_type: (onboarding.employment_type as string) || null,
    career_levels: (onboarding.career_levels as string[]) || null,
    company_car_from: (onboarding.company_car_from as string) || null,
    training_type: (onboarding.training_type as string) || null,
    client_nameable: (onboarding.client_nameable as boolean) || false,
    client_name: (onboarding.client_name as string) || null,
    extras: (onboarding.extras as string[]) || null,
    experience_needed: (onboarding.experience_needed as boolean) || false,
    drivers_license_needed: (onboarding.drivers_license_needed as boolean) || false,
    start_date: (onboarding.start_date as string) || null,
    career_page_url: null,
    tone: (onboarding.tone as string) || 'du',
    contact_name: (onboarding.contact_name as string) || null,
    contact_phone: (onboarding.contact_phone as string) || null,
  };

  const contentTypes = ['ad_copy', 'video_script', 'creative_brief', 'job_posting'] as const;

  for (const type of contentTypes) {
    try {
      const content = await generateContent(type, ctx);
      if (content) {
        // Save to content library as draft
        await admin.from('content_library').insert({
          agency_id: agencyId,
          content_type: type === 'creative_brief' ? 'video_script' : type,
          title: {
            ad_copy: 'Ad Copys (3 Varianten)',
            video_script: 'Video Ad Skripte (5 Varianten)',
            creative_brief: 'Webseiten-Video Skript',
            job_posting: 'Indeed-Anzeige',
          }[type],
          content,
          version: 1,
          status: 'draft',
        });

        // Update fulfillment task to review
        const taskTypeMap: Record<string, string> = {
          ad_copy: 'ad_copy',
          video_script: 'video_script',
          creative_brief: 'creative_brief',
          job_posting: 'job_posting',
        };
        await admin
          .from('fulfillment_tasks')
          .update({ status: 'review', updated_at: new Date().toISOString() })
          .eq('agency_id', agencyId)
          .eq('task_type', taskTypeMap[type])
          .eq('status', 'pending');
      }
    } catch {
      // Silent fail per content type — don't block other generations
    }
  }
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
  // Telefon-Skripte + VG-Leitfaden sind Masterclass-Content, nicht individuell generiert
  const fulfillmentTasks = [
    { title: 'Ad Copys generieren', task_type: 'ad_copy', sort_order: 1 },
    { title: 'Funnel-Texte generieren', task_type: 'funnel_text', sort_order: 2 },
    { title: 'Indeed-Anzeige generieren', task_type: 'job_posting', sort_order: 3 },
    { title: 'Video-Skript generieren', task_type: 'video_script', sort_order: 4 },
    { title: 'Creative Brief generieren', task_type: 'creative_brief', sort_order: 5 },
    { title: 'Perspective Funnel erstellen', task_type: 'perspective_funnel', sort_order: 6 },
    { title: 'Meta Zugang verifizieren', task_type: 'manual', sort_order: 7 },
    { title: 'Meta Kampagne hochladen', task_type: 'meta_upload', sort_order: 8 },
    { title: 'Indeed Anzeige einpflegen', task_type: 'manual', sort_order: 9 },
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

  // Auto-generate all content in background after onboarding
  autoGenerateContent(profile.agency_id, body).catch(() => {});

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
