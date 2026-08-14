import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { generateContent as callClaude, ContentType, OnboardingContext } from '@/lib/ai/claude';

const ALLOWED_TYPES = ['ad_copy', 'phone_script', 'script', 'funnel_text', 'video_script', 'job_posting', 'creative_brief', 'vg_leitfaden', 'follow_up', 'absage'];

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { type, agency_id, context, fulfillment_task_id } = await req.json();

  if (!ALLOWED_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid content type' }, { status: 400 });
  }

  // Fetch onboarding data for context
  const { data: onboarding } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('agency_id', agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  const aiContext: OnboardingContext = {
    // Legacy fields
    company_name: onboarding?.company_name ?? null,
    industry: onboarding?.industry ?? null,
    region: onboarding?.region ?? null,
    employee_count: onboarding?.employee_count ?? null,
    hiring_target: onboarding?.hiring_target ?? null,
    hiring_timeframe: onboarding?.hiring_timeframe ?? null,
    experience_required: onboarding?.experience_required ?? null,
    compensation_model: onboarding?.compensation_model ?? null,
    usps: onboarding?.usps ?? null,
    primary_color: onboarding?.primary_color ?? null,
    // D2D-specific fields
    job_title: onboarding?.job_title ?? null,
    regions: onboarding?.regions ?? null,
    radius_km: onboarding?.radius_km ?? null,
    product: onboarding?.product ?? null,
    task_type: onboarding?.task_type ?? null,
    compensation: onboarding?.compensation ?? null,
    commission_per_unit: onboarding?.commission_per_unit ?? null,
    monthly_earning_from: onboarding?.monthly_earning_from ?? null,
    monthly_earning_to: onboarding?.monthly_earning_to ?? null,
    employment_type: onboarding?.employment_type ?? null,
    career_levels: onboarding?.career_levels ?? null,
    company_car_from: onboarding?.company_car_from ?? null,
    training_type: onboarding?.training_type ?? null,
    client_nameable: onboarding?.client_nameable ?? false,
    client_name: onboarding?.client_name ?? null,
    extras: onboarding?.extras ?? null,
    experience_needed: onboarding?.experience_needed ?? false,
    drivers_license_needed: onboarding?.drivers_license_needed ?? false,
    start_date: onboarding?.start_date ?? null,
    career_page_url: onboarding?.career_page_url ?? null,
    tone: onboarding?.tone ?? 'du',
    contact_name: onboarding?.contact_name ?? null,
  };

  // Map DB content types to AI content types
  const contentTypeMap: Record<string, ContentType> = {
    ad_copy: 'ad_copy',
    phone_script: 'phone_script',
    script: 'phone_script',
    funnel_text: 'funnel_text',
    video_script: 'video_script',
    job_posting: 'job_posting',
    creative_brief: 'creative_brief',
    vg_leitfaden: 'vg_leitfaden',
    follow_up: 'follow_up',
    absage: 'absage',
  };

  const aiType = contentTypeMap[type] || 'ad_copy';
  const generatedContent = await callClaude(aiType, aiContext, context?.previousVersion, context?.feedback);

  // Save to generated_content table
  const { data: saved, error } = await supabase
    .from('generated_content')
    .insert({
      agency_id,
      fulfillment_task_id: fulfillment_task_id || null,
      content_type: type,
      content: generatedContent,
      created_by: user.id,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(saved);
}
