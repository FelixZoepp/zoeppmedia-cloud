import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { detectProblemsForAgency } from '@/lib/problems/detect';
import { sendWeeklyReports, WeeklyReportResult } from '@/lib/email/weekly-report-send';

// Vercel Cron: GET /api/cron/daily at 08:00 UTC daily

async function runDailyJobs() {
  const supabase = createAdminClient();

  const { data: agencies, error } = await supabase
    .from('agencies')
    .select('id, name, onboarding_completed, created_at, meta_ad_account_id');

  if (error) {
    return { ok: false, error: error.message };
  }

  const results: Record<string, string> = {};
  let problemsDetected = 0;
  let surveysScheduled = 0;
  let recurringCreated = 0;
  let remindersS = 0;
  let backupAdAccountTasksCreated = 0;

  const now = new Date();
  const cutoff48h = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000);
  const currentMonth = now.toISOString().slice(0, 7);

  for (const agency of agencies ?? []) {
    try {
      // 1. Problem Detection
      const { detected } = await detectProblemsForAgency(supabase, agency.id);
      problemsDetected += detected;

      // 2. Recurring Fulfillment Tasks
      if (agency.onboarding_completed) {
        // Indeed restart every 30 days
        const { data: lastIndeed } = await supabase
          .from('recurring_fulfillment_tasks')
          .select('created_at')
          .eq('agency_id', agency.id)
          .eq('task_key', 'indeed_restart')
          .order('created_at', { ascending: false })
          .limit(1);

        if (!lastIndeed?.[0] || new Date(lastIndeed[0].created_at) < thirtyDaysAgo) {
          await supabase.from('recurring_fulfillment_tasks').insert({
            agency_id: agency.id,
            task_key: 'indeed_restart',
            title: 'Indeed Anzeige neu starten',
            status: 'pending',
            due_date: now.toISOString().split('T')[0],
            triggered_by: 'schedule',
          });
          recurringCreated++;
        }

        // Reels monthly
        const { data: agencyData } = await supabase
          .from('agencies')
          .select('reels_per_month')
          .eq('id', agency.id)
          .single();

        if (agencyData && agencyData.reels_per_month > 0) {
          const { data: lastReels } = await supabase
            .from('recurring_fulfillment_tasks')
            .select('id')
            .eq('agency_id', agency.id)
            .eq('task_key', 'reels_create')
            .gte('created_at', `${currentMonth}-01T00:00:00Z`)
            .limit(1);

          if (!lastReels?.length) {
            await supabase.from('recurring_fulfillment_tasks').insert({
              agency_id: agency.id,
              task_key: 'reels_create',
              title: `${agencyData.reels_per_month} Reels erstellen`,
              status: 'pending',
              due_date: `${currentMonth}-15`,
              triggered_by: 'schedule',
            });
            recurringCreated++;
          }
        }
      }

      // 3. Survey Milestones
      const { data: existingSchedules } = await supabase
        .from('survey_schedule')
        .select('trigger_key')
        .eq('agency_id', agency.id);
      const existingKeys = new Set((existingSchedules || []).map(e => e.trigger_key));

      const agencyAge = now.getTime() - new Date(agency.created_at).getTime();

      // Post-onboarding survey
      if (agency.onboarding_completed && !existingKeys.has('post_onboarding')) {
        const { data: templates } = await supabase
          .from('survey_templates')
          .select('id')
          .eq('title', 'Onboarding-Feedback')
          .limit(1);
        if (templates?.[0]) {
          await supabase.from('survey_schedule').insert({
            agency_id: agency.id,
            trigger_key: 'post_onboarding',
            template_id: templates[0].id,
            scheduled_at: now.toISOString(),
          });
          surveysScheduled++;
        }
      }

      // Bi-weekly survey (every 2 weeks after onboarding, not monthly)
      if (agency.onboarding_completed && agencyAge > 14 * 86400000) {
        // Calculate which 2-week period we're in
        const weeksActive = Math.floor(agencyAge / (7 * 86400000));
        const biweeklyPeriod = Math.floor(weeksActive / 2);
        const biweeklyKey = `biweekly_${biweeklyPeriod}`;

        if (!existingKeys.has(biweeklyKey)) {
          const { data: templates } = await supabase
            .from('survey_templates')
            .select('id')
            .eq('title', 'Kundenzufriedenheit')
            .limit(1);
          if (templates?.[0]) {
            await supabase.from('survey_schedule').insert({
              agency_id: agency.id,
              trigger_key: biweeklyKey,
              template_id: templates[0].id,
              scheduled_at: now.toISOString(),
            });

            // Send email notification
            const { data: owner } = await supabase
              .from('users')
              .select('email, name')
              .eq('agency_id', agency.id)
              .eq('role', 'agency_owner')
              .limit(1)
              .single();

            if (owner) {
              try {
                const { sendSurveyNotification } = await import('@/lib/email/resend');
                const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
                await sendSurveyNotification(owner.email, owner.name, 'Kundenzufriedenheit', `${appUrl}/reports`);
              } catch { /* silent */ }
            }

            surveysScheduled++;
          }
        }
      }

      // Quarterly survey (> 90 days active)
      const quarter = Math.floor(now.getMonth() / 3);
      const quarterKey = `quarterly_${now.getFullYear()}_Q${quarter + 1}`;
      if (agencyAge > 90 * 86400000 && !existingKeys.has(quarterKey)) {
        const { data: templates } = await supabase
          .from('survey_templates')
          .select('id')
          .eq('title', 'Gesamtbewertung')
          .limit(1);
        if (templates?.[0]) {
          await supabase.from('survey_schedule').insert({
            agency_id: agency.id,
            trigger_key: quarterKey,
            template_id: templates[0].id,
            scheduled_at: now.toISOString(),
          });
          surveysScheduled++;
        }
      }

      // 4. Backup Ad Account Task (30+ days after onboarding)
      if (agency.onboarding_completed && new Date(agency.created_at) < thirtyDaysAgo) {
        const { data: existingBackupTask } = await supabase
          .from('fulfillment_tasks')
          .select('id')
          .eq('agency_id', agency.id)
          .eq('task_type', 'backup_ad_account')
          .limit(1);

        if (!existingBackupTask?.length) {
          await supabase.from('fulfillment_tasks').insert({
            agency_id: agency.id,
            title: 'Backup-Werbekonto anlegen',
            task_type: 'backup_ad_account',
            status: 'pending',
            sort_order: 11,
          });
          backupAdAccountTasksCreated++;
        }
      }

      results[agency.id] = 'ok';
    } catch {
      results[agency.id] = 'error';
    }
  }

  // 5. Onboarding Reminders (48h without completing)
  const { data: pendingAgencies } = await supabase
    .from('agencies')
    .select('id')
    .eq('onboarding_completed', false)
    .lt('created_at', cutoff48h);

  if (pendingAgencies?.length) {
    const { sendOnboardingReminder } = await import('@/lib/email/resend');
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';

    for (const agency of pendingAgencies) {
      const { data: owner } = await supabase
        .from('users')
        .select('email, name')
        .eq('agency_id', agency.id)
        .eq('role', 'agency_owner')
        .limit(1)
        .single();

      if (owner) {
        try {
          await sendOnboardingReminder(owner.email, owner.name, `${appUrl}/onboarding`);
          remindersS++;
        } catch { /* silent */ }
      }
    }
  }

  // 5b. Betreuungsstufen A/B: fällige Fahrplan-Call-Aufgaben anlegen
  let fahrplanCalls = 0;
  try {
    const { ensureFahrplanCallTasks } = await import('@/lib/fulfillment/betreuung');
    fahrplanCalls = await ensureFahrplanCallTasks(supabase);
  } catch { /* silent */ }

  // 6. Meta Insights Sync + KPI-Snapshots (standardisierte 7-Tage-Zahlen pro Agentur)
  let metaSynced = 0;
  let kpiSnapshots = 0;
  try {
    const { syncMetaInsights, writeKpiSnapshots } = await import('@/lib/meta/sync');
    if (process.env.META_SYSTEM_USER_TOKEN) {
      const syncResult = await syncMetaInsights(supabase);
      metaSynced = syncResult.synced;
    }
    // Snapshot auch ohne Meta-Token: Call-/Kandidaten-KPIs sind unabhängig davon
    kpiSnapshots = await writeKpiSnapshots(supabase);
  } catch { /* silent */ }

  // 7. Weekly report — only on Mondays
  // DEAKTIVIERT (2026-09-17, Felix): Wochenberichte vorerst nicht versenden.
  // Zum Reaktivieren: WEEKLY_REPORTS_ENABLED=true als Env-Var setzen.
  let weeklyReport: WeeklyReportResult | null = null;
  if (now.getDay() === 1 && process.env.WEEKLY_REPORTS_ENABLED === 'true') {
    try {
      weeklyReport = await sendWeeklyReports(supabase);
    } catch {
      weeklyReport = { ok: false, sent: 0, skipped: 0, errors: 1, details: [] };
    }
  }

  // 8. SEPA Pre-Debit Notifications (1 day before debit)
  let preDebitSent = 0;
  try {
    const { checkPreDebitNotifications } = await import('@/lib/billing/pre-debit-notification');
    preDebitSent = await checkPreDebitNotifications(supabase);
  } catch { /* silent */ }

  // 9. Access item reminders (escalating: day 1/3/5/7)
  let accessReminders = 0;
  try {
    const { checkAccessReminders } = await import('@/lib/fulfillment/access-reminders');
    await checkAccessReminders(supabase);
    accessReminders = 1;
  } catch { /* silent */ }

  // 10. Masterclass nudges
  try {
    const { checkMasterclassNudges } = await import('@/lib/masterclass/nudge-checker');
    await checkMasterclassNudges(supabase);
  } catch { /* silent */ }

  // 11. Tag-7/14 Report generation
  let reportsGenerated = 0;
  try {
    const { checkAndGenerateReports } = await import('@/lib/reports/check-reports');
    const reportResult = await checkAndGenerateReports(supabase);
    reportsGenerated = typeof reportResult === 'number' ? reportResult : 1;
  } catch { /* silent */ }

  // 12. Health checks
  let healthChecksRun = 0;
  try {
    const { runHealthChecks } = await import('@/lib/health/run-checks');
    const healthResult = await runHealthChecks(supabase);
    healthChecksRun = typeof healthResult === 'number' ? healthResult : 1;
  } catch { /* silent */ }

  // 13. SLA escalation check
  try {
    const { checkSlaEscalations } = await import('@/lib/tasks/sla-escalation');
    await checkSlaEscalations(supabase);
  } catch { /* silent */ }

  // 14. Billing: überfällige Rechnungen + fehlgeschlagene Zahlungen → Aufgaben
  let overdueTasksCreated = 0;
  try {
    const { checkOverdueBillingRuns } = await import('@/lib/billing/overdue-check');
    overdueTasksCreated = await checkOverdueBillingRuns(supabase);
  } catch { /* silent */ }

  // 15. Slack Daily Reports (Marketing + Sales)
  try {
    const { sendDailySlackReports } = await import('@/lib/slack/daily-reports');
    await sendDailySlackReports(supabase);
  } catch { /* silent */ }

  return {
    ok: true,
    processed: agencies?.length ?? 0,
    problemsDetected,
    recurringCreated,
    surveysScheduled,
    reminders: remindersS,
    fahrplanCalls,
    metaSynced,
    kpiSnapshots,
    backupAdAccountTasksCreated,
    weeklyReport,
    preDebitSent,
    accessReminders,
    reportsGenerated,
    healthChecksRun,
    overdueTasksCreated,
  };
}

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET nicht konfiguriert' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runDailyJobs();
  return NextResponse.json(result);
}

export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json({ error: 'CRON_SECRET nicht konfiguriert' }, { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await runDailyJobs();
  return NextResponse.json(result);
}
