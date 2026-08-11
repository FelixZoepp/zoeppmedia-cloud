import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { generateContent as callClaude, ContentType, OnboardingContext } from '@/lib/ai/claude';

const ALLOWED_TYPES = ['ad_copy', 'script', 'funnel_text', 'video_script', 'job_posting', 'creative_brief'];

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
  };

  // Map DB content types to AI content types
  const contentTypeMap: Record<string, ContentType> = {
    ad_copy: 'ad_copy',
    script: 'phone_script',
    funnel_text: 'funnel_text',
    video_script: 'video_script',
    job_posting: 'job_posting',
    creative_brief: 'creative_brief',
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
