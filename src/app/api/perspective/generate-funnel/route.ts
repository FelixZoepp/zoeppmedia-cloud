import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildFunnelPrompt, buildFunnelName } from '@/lib/ai/funnel-prompt';

// Workspace "Direktvertriebs-Agenturen" in Perspective
const WORKSPACE_ID = '665852cb2eed8900147847d2';

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
      { error: 'Onboarding nicht abgeschlossen' },
      { status: 400 }
    );
  }

  // Load agency
  const { data: agency } = await supabase
    .from('agencies')
    .select('name, contact_name, email, phone')
    .eq('id', agency_id)
    .single();

  const companyName = onboarding.company_name || agency?.name || 'Unbekannt';

  // Build the CGMS-style funnel prompt
  const prompt = buildFunnelPrompt({
    company_name: companyName,
    job_title: onboarding.job_title || 'Vertriebsmitarbeiter (m/w/d)',
    regions: onboarding.regions || [],
    product: onboarding.product || 'pv',
    task_type: onboarding.task_type || 'leads_only',
    compensation: onboarding.compensation || 'pure_commission',
    commission_per_unit: onboarding.commission_per_unit || '',
    monthly_earning_from: onboarding.monthly_earning_from || 3000,
    monthly_earning_to: onboarding.monthly_earning_to || 8000,
    employment_type: onboarding.employment_type || 'self_employed',
    career_levels: onboarding.career_levels || ['Vertriebler', 'Teamleiter'],
    company_car_from: onboarding.company_car_from || 'nein',
    training_type: onboarding.training_type || 'one_on_one',
    client_nameable: onboarding.client_nameable || false,
    client_name: onboarding.client_name || null,
    extras: onboarding.extras || [],
    experience_needed: onboarding.experience_needed || false,
    drivers_license_needed: onboarding.drivers_license_needed || false,
    tone: onboarding.tone || 'du',
    primary_color: onboarding.primary_color || '#ff8c00',
  });

  const funnelName = buildFunnelName(companyName);

  return NextResponse.json({
    funnel_prompt: prompt,
    funnel_name: funnelName,
    workspace_id: WORKSPACE_ID,
    brand_info: {
      company_name: companyName,
      primary_color: onboarding.primary_color || '#ff8c00',
      logo_url: onboarding.logo_url || null,
      industry: `D2D Recruiting / ${onboarding.product || 'Vertrieb'}`,
      target_audience: 'Quereinsteiger und Vertriebler 20-45 Jahre',
    },
    onboarding_id: onboarding.id,
  });
}
