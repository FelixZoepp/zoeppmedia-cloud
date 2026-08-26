import { SupabaseClient } from '@supabase/supabase-js';
import { WeeklyReportEmailParams } from './weekly-report-template';

const WEEKLY_TIPS = [
  'Bewerber innerhalb der ersten Stunde anrufen verdreifacht die Erreichquote.',
  'Probetage mit klarer Agenda haben eine 2x h\u00f6here Einstellungsquote.',
  'Absagen sind okay \u2014 No-Shows nicht. So bleibst du fair und effizient.',
  'Drei Anrufversuche zu verschiedenen Tageszeiten erh\u00f6hen die Erreichquote um 80\u202f%.',
  'Eine kurze WhatsApp-Nachricht vor dem Anruf steigert die Antwortrate deutlich.',
  'Schnelle R\u00fcckmeldung zeigt Professionalit\u00e4t \u2014 das spricht sich rum.',
  'Dokumentiere Absagegr\u00fcnde \u2014 sie helfen uns, deine Kampagne zu verbessern.',
  'Bewerber, die am Wochenende kommen, sind oft besonders motiviert.',
  'Halte dein Team-Profil aktuell \u2014 Bewerber googeln dich.',
  'Setze dir feste Zeiten f\u00fcr die Bewerberbearbeitung \u2014 Routine schl\u00e4gt Zufall.',
];

function getISOWeekNumber(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  return (
    1 +
    Math.round(
      ((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    )
  );
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Activity-log action_type groupings for human-readable summaries */
const ACTION_TYPE_LABELS: Record<string, string> = {
  campaign_adjustment: 'Kampagnen-Anpassungen',
  creative_swap: 'Creatives getauscht',
  report_created: 'Reports erstellt',
  task_completed: 'Aufgaben erledigt',
  budget_change: 'Budget-\u00c4nderungen',
  content_approved: 'Inhalte freigegeben',
  content_rejected: 'Inhalte abgelehnt',
  stage_change: 'Pipeline-Aktualisierungen',
  candidate_created: 'Bewerber erfasst',
  call_logged: 'Anrufe protokolliert',
};

export type WeeklyReportData = Omit<WeeklyReportEmailParams, 'dashboard_url'>;

export async function generateWeeklyReportData(
  supabase: SupabaseClient,
  agencyId: string
): Promise<WeeklyReportData> {
  const now = new Date();
  const kw = getISOWeekNumber(now);

  // Time boundaries
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartISO = weekStart.toISOString();

  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);
  const prevWeekStartISO = prevWeekStart.toISOString();

  // Fetch agency info
  const { data: agency } = await supabase
    .from('agencies')
    .select('contact_name')
    .eq('id', agencyId)
    .single();

  const contactName = agency?.contact_name ?? 'Team';

  // Fetch pipeline stages we need
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, name')
    .order('sort_order', { ascending: true });

  const stageMap = new Map<string, string>();
  for (const s of stages ?? []) {
    stageMap.set(s.name, s.id);
  }

  const contactedStageId = stageMap.get('Kontaktiert');
  const interviewStageId = stageMap.get('Termin vereinbart');
  const hiredStageId = stageMap.get('Eingestellt');

  // ── Current week counts ───────────────────────────────────────────────────

  // New candidates this week
  const { count: currentCandidates } = await supabase
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .gte('created_at', weekStartISO);

  // Get agency candidate IDs for stage transition lookups
  const { data: agencyCandidates } = await supabase
    .from('candidates')
    .select('id')
    .eq('agency_id', agencyId);

  const candidateIds = (agencyCandidates ?? []).map((c) => c.id);

  let currentContacted = 0;
  let currentInterviews = 0;
  let currentHired = 0;

  if (candidateIds.length > 0) {
    // Batch candidate IDs (Supabase .in() has limits, but typically OK for <1000)
    const { data: stageChangesThisWeek } = await supabase
      .from('candidate_stages')
      .select('stage_id')
      .gte('changed_at', weekStartISO)
      .in('candidate_id', candidateIds);

    for (const sc of stageChangesThisWeek ?? []) {
      if (contactedStageId && sc.stage_id === contactedStageId) currentContacted++;
      if (interviewStageId && sc.stage_id === interviewStageId) currentInterviews++;
      if (hiredStageId && sc.stage_id === hiredStageId) currentHired++;
    }
  }

  // ── Previous week counts ──────────────────────────────────────────────────

  const { count: prevCandidates } = await supabase
    .from('candidates')
    .select('*', { count: 'exact', head: true })
    .eq('agency_id', agencyId)
    .gte('created_at', prevWeekStartISO)
    .lt('created_at', weekStartISO);

  let prevContacted = 0;
  let prevInterviews = 0;
  let prevHired = 0;

  if (candidateIds.length > 0) {
    const { data: stageChangesPrevWeek } = await supabase
      .from('candidate_stages')
      .select('stage_id')
      .gte('changed_at', prevWeekStartISO)
      .lt('changed_at', weekStartISO)
      .in('candidate_id', candidateIds);

    for (const sc of stageChangesPrevWeek ?? []) {
      if (contactedStageId && sc.stage_id === contactedStageId) prevContacted++;
      if (interviewStageId && sc.stage_id === interviewStageId) prevInterviews++;
      if (hiredStageId && sc.stage_id === hiredStageId) prevHired++;
    }
  }

  // ── Median TTFC ──────────────────────────────────────────────────────────

  const { data: ttfcCandidates } = await supabase
    .from('candidates')
    .select('ttfc_seconds')
    .eq('agency_id', agencyId)
    .gte('created_at', weekStartISO)
    .not('ttfc_seconds', 'is', null);

  const ttfcValues = (ttfcCandidates ?? [])
    .map((c) => c.ttfc_seconds as number)
    .filter((v) => v > 0);
  const medianTtfc = median(ttfcValues);

  // ── Activity log ──────────────────────────────────────────────────────────

  const { data: activityEntries } = await supabase
    .from('activity_log')
    .select('action_type')
    .eq('agency_id', agencyId)
    .gte('created_at', weekStartISO);

  const activityCounts = new Map<string, number>();
  for (const entry of activityEntries ?? []) {
    const type = entry.action_type;
    activityCounts.set(type, (activityCounts.get(type) ?? 0) + 1);
  }

  const activities: { type: string; count: number }[] = [];
  for (const [type, count] of activityCounts) {
    // Skip internal/automated entries that aren't meaningful for the client
    if (type === 'login' || type === 'page_view') continue;
    activities.push({
      type: ACTION_TYPE_LABELS[type] ?? type,
      count,
    });
  }

  // ── Open issues ───────────────────────────────────────────────────────────

  const openIssues: string[] = [];

  // Unresolved problems
  const { data: problems } = await supabase
    .from('agency_problems')
    .select('problem_key, severity')
    .eq('agency_id', agencyId)
    .is('resolved_at', null);

  for (const p of problems ?? []) {
    const severity = p.severity === 'critical' ? '(kritisch)' : '(Warnung)';
    openIssues.push(`${p.problem_key.replace(/_/g, ' ')} ${severity}`);
  }

  // Incomplete fulfillment tasks
  const { data: pendingTasks } = await supabase
    .from('fulfillment_tasks')
    .select('title')
    .eq('agency_id', agencyId)
    .in('status', ['pending', 'in_progress']);

  for (const t of pendingTasks ?? []) {
    openIssues.push(t.title);
  }

  // ── Tip of the week ──────────────────────────────────────────────────────

  const tipIndex = kw % WEEKLY_TIPS.length;
  const tip = WEEKLY_TIPS[tipIndex];

  return {
    contact_name: contactName,
    kw,
    current: {
      candidates: currentCandidates ?? 0,
      contacted: currentContacted,
      interviews: currentInterviews,
      hired: currentHired,
      median_ttfc: medianTtfc,
    },
    previous: {
      candidates: prevCandidates ?? 0,
      contacted: prevContacted,
      interviews: prevInterviews,
      hired: prevHired,
    },
    activities,
    open_issues: openIssues,
    tip,
  };
}
