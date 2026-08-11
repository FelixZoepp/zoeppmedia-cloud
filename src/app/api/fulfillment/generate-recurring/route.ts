import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, name, has_video_shoot, reels_per_month, onboarding_completed');

  if (!agencies) return NextResponse.json({ created: 0 });

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const currentMonth = now.toISOString().slice(0, 7); // YYYY-MM
  let created = 0;

  for (const agency of agencies) {
    if (!agency.onboarding_completed) continue;

    // 1. Indeed Restart — every 30 days, always
    const { data: lastIndeed } = await supabase
      .from('recurring_fulfillment_tasks')
      .select('created_at')
      .eq('agency_id', agency.id)
      .eq('task_key', 'indeed_restart')
      .order('created_at', { ascending: false })
      .limit(1);

    const lastIndeedDate = lastIndeed?.[0]?.created_at;
    const indeedDue = !lastIndeedDate || new Date(lastIndeedDate) < thirtyDaysAgo;

    if (indeedDue) {
      await supabase.from('recurring_fulfillment_tasks').insert({
        agency_id: agency.id,
        task_key: 'indeed_restart',
        title: 'Indeed Anzeige neu starten',
        description: 'Indeed deaktiviert Anzeigen nach 30 Tagen. Anzeige neu veröffentlichen oder aktualisieren.',
        status: 'pending',
        due_date: now.toISOString().split('T')[0],
        triggered_by: 'schedule',
      });
      created++;
    }

    // 2. Reels — monthly, only if reels_per_month > 0
    if (agency.reels_per_month > 0) {
      const { data: lastReels } = await supabase
        .from('recurring_fulfillment_tasks')
        .select('created_at')
        .eq('agency_id', agency.id)
        .eq('task_key', 'reels_create')
        .gte('created_at', `${currentMonth}-01T00:00:00Z`)
        .limit(1);

      if (!lastReels || lastReels.length === 0) {
        await supabase.from('recurring_fulfillment_tasks').insert({
          agency_id: agency.id,
          task_key: 'reels_create',
          title: `${agency.reels_per_month} Reels erstellen`,
          description: `Monatliche Reels für ${agency.name}: ${agency.reels_per_month} Stück.`,
          status: 'pending',
          due_date: `${currentMonth}-15`,
          triggered_by: 'schedule',
        });
        created++;
      }
    }

    // 3. Creatives testen — triggered by active problems (high_cpl or low_candidates)
    const { data: activeProblems } = await supabase
      .from('agency_problems')
      .select('id, problem_key')
      .eq('agency_id', agency.id)
      .in('problem_key', ['high_cpl', 'low_candidates'])
      .is('resolved_at', null);

    if (activeProblems && activeProblems.length > 0) {
      // Check if there's already a pending/in_progress creatives task
      const { data: existingCreatives } = await supabase
        .from('recurring_fulfillment_tasks')
        .select('id')
        .eq('agency_id', agency.id)
        .eq('task_key', 'creatives_test')
        .in('status', ['pending', 'in_progress'])
        .limit(1);

      if (!existingCreatives || existingCreatives.length === 0) {
        await supabase.from('recurring_fulfillment_tasks').insert({
          agency_id: agency.id,
          task_key: 'creatives_test',
          title: 'Neue Meta Creatives testen',
          description: `Performance-Problem erkannt. Mindestens 3 neue Creative-Varianten erstellen und testen.`,
          status: 'pending',
          due_date: new Date(now.getTime() + 3 * 86400000).toISOString().split('T')[0],
          triggered_by: 'problem',
          problem_id: activeProblems[0].id,
        });
        created++;
      }
    }
  }

  return NextResponse.json({ created, agencies_checked: agencies.length });
}
