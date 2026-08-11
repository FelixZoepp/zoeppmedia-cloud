import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSurveyNotification } from '@/lib/email/resend';

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';

  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, name, onboarding_completed, created_at');

  const { data: templates } = await supabase
    .from('survey_templates')
    .select('id, title')
    .eq('active', true);

  if (!agencies || !templates) {
    return NextResponse.json({ error: 'No data' }, { status: 500 });
  }

  const templateMap = new Map(templates.map((t) => [t.title, t.id]));
  let scheduled = 0;

  for (const agency of agencies) {
    const { data: existing } = await supabase
      .from('survey_schedule')
      .select('trigger_key')
      .eq('agency_id', agency.id);

    const existingKeys = new Set((existing || []).map((e) => e.trigger_key));
    const agencyAge = Date.now() - new Date(agency.created_at).getTime();

    // ── Milestone 1: Post-onboarding ──────────────────────────
    if (agency.onboarding_completed && !existingKeys.has('post_onboarding')) {
      const templateId = templateMap.get('Onboarding-Feedback');
      if (templateId) {
        await supabase.from('survey_schedule').insert({
          agency_id: agency.id,
          trigger_key: 'post_onboarding',
          template_id: templateId,
          scheduled_at: new Date().toISOString(),
        });

        const { data: owner } = await supabase
          .from('users')
          .select('email, name')
          .eq('agency_id', agency.id)
          .eq('role', 'agency_owner')
          .limit(1)
          .single();

        if (owner) {
          try {
            await sendSurveyNotification(
              owner.email,
              owner.name,
              'Onboarding-Feedback',
              `${appUrl}/reports`,
            );
            await supabase
              .from('survey_schedule')
              .update({ sent_at: new Date().toISOString() })
              .eq('agency_id', agency.id)
              .eq('trigger_key', 'post_onboarding');
          } catch {
            // email failed — schedule entry still created
          }
        }

        scheduled++;
      }
    }

    // ── Milestone 2: Campaign 2 weeks ─────────────────────────
    // Triggered when agency is at least 14 days old (proxy for campaign start)
    if (agencyAge > 14 * 86_400_000 && !existingKeys.has('campaign_2_weeks')) {
      const templateId = templateMap.get('Erste Eindrücke');
      if (templateId) {
        await supabase.from('survey_schedule').insert({
          agency_id: agency.id,
          trigger_key: 'campaign_2_weeks',
          template_id: templateId,
          scheduled_at: new Date().toISOString(),
        });
        scheduled++;
      }
    }

    // ── Milestone 3: Monthly ──────────────────────────────────
    // One entry per calendar month, keyed as monthly_YYYY-MM
    const monthKey = `monthly_${new Date().toISOString().slice(0, 7)}`;
    if (agencyAge > 30 * 86_400_000 && !existingKeys.has(monthKey)) {
      const templateId = templateMap.get('Kundenzufriedenheit');
      if (templateId) {
        await supabase.from('survey_schedule').insert({
          agency_id: agency.id,
          trigger_key: monthKey,
          template_id: templateId,
          scheduled_at: new Date().toISOString(),
        });
        scheduled++;
      }
    }

    // ── Milestone 4: Quarterly ────────────────────────────────
    // One entry per quarter, keyed as quarterly_YYYY_Q{n}
    const quarter = Math.floor(new Date().getMonth() / 3) + 1;
    const quarterKey = `quarterly_${new Date().getFullYear()}_Q${quarter}`;
    if (agencyAge > 90 * 86_400_000 && !existingKeys.has(quarterKey)) {
      const templateId = templateMap.get('Gesamtbewertung');
      if (templateId) {
        await supabase.from('survey_schedule').insert({
          agency_id: agency.id,
          trigger_key: quarterKey,
          template_id: templateId,
          scheduled_at: new Date().toISOString(),
        });
        scheduled++;
      }
    }
  }

  return NextResponse.json({ scheduled });
}
