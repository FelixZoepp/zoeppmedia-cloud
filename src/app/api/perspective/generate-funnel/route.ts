import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fillTemplate, FUNNEL_TEMPLATE } from '@/lib/ai/templates';
import type { OnboardingContext } from '@/lib/ai/claude';

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { agency_id } = body;

  if (!agency_id) {
    return NextResponse.json({ error: 'agency_id ist erforderlich' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Load onboarding data
  const { data: onboarding } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('agency_id', agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!onboarding) {
    return NextResponse.json(
      { error: 'Onboarding nicht abgeschlossen — kein Datensatz gefunden' },
      { status: 400 }
    );
  }

  // Load agency for contact info
  const { data: agency } = await supabase
    .from('agencies')
    .select('name, contact_name, email, phone')
    .eq('id', agency_id)
    .single();

  // Build context from onboarding data
  const ctx: OnboardingContext = {
    company_name: onboarding.company_name || agency?.name || null,
    industry: onboarding.industry,
    region: onboarding.region,
    employee_count: onboarding.employee_count,
    hiring_target: onboarding.hiring_target,
    hiring_timeframe: onboarding.hiring_timeframe,
    experience_required: onboarding.experience_required,
    compensation_model: onboarding.compensation_model,
    usps: onboarding.usps,
    primary_color: onboarding.primary_color,
    job_title: onboarding.job_title,
    regions: onboarding.regions,
    radius_km: onboarding.radius_km,
    product: onboarding.product,
    task_type: onboarding.task_type,
    compensation: onboarding.compensation,
    commission_per_unit: onboarding.commission_per_unit,
    monthly_earning_from: onboarding.monthly_earning_from,
    monthly_earning_to: onboarding.monthly_earning_to,
    employment_type: onboarding.employment_type,
    career_levels: onboarding.career_levels,
    company_car_from: onboarding.company_car_from,
    training_type: onboarding.training_type,
    client_nameable: onboarding.client_nameable ?? false,
    client_name: onboarding.client_name,
    extras: onboarding.extras,
    experience_needed: onboarding.experience_needed ?? false,
    drivers_license_needed: onboarding.drivers_license_needed ?? false,
    start_date: onboarding.start_date,
    career_page_url: onboarding.career_page_url,
    tone: onboarding.tone || 'du',
    contact_name: onboarding.contact_name || agency?.contact_name || null,
    contact_phone: onboarding.contact_phone || agency?.phone || null,
  };

  // Fill the funnel template
  const filledTemplate = fillTemplate(FUNNEL_TEMPLATE, ctx);

  // Build brand info for Perspective
  const brandInfo = {
    company_name: ctx.company_name || 'Unbekannt',
    primary_color: ctx.primary_color || '#E0354B',
    contact_name: ctx.contact_name || '',
    contact_phone: ctx.contact_phone || '',
    logo_url: onboarding.logo_url || null,
    regions: ctx.regions || (ctx.region ? [ctx.region] : []),
    job_title: ctx.job_title || 'Vertriebsmitarbeiter',
  };

  return NextResponse.json({
    funnel_text: filledTemplate,
    brand_info: brandInfo,
    onboarding_id: onboarding.id,
  });
}
