import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';

// ── Helpers ────────────────────────────────────────────────────────────────

function fourteenDaysAgo(from: Date = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - 14);
  d.setHours(0, 0, 0, 0);
  return d;
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

function pctChange(current: number, previous: number): number | null {
  if (previous === 0 && current === 0) return 0;
  if (previous === 0) return 100;
  return Math.round(((current - previous) / previous) * 100);
}

function addDays(date: Date, days: number): string {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ── Stage name matching ────────────────────────────────────────────────────

type StageNameMap = Map<string, string>; // stage_id -> lowercase stage name

function stageMatches(stageId: string, nameMap: StageNameMap, keyword: string): boolean {
  const name = nameMap.get(stageId)?.toLowerCase() ?? '';
  return name.includes(keyword.toLowerCase());
}

// ── Main handler ───────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agencyId: string }> }
) {
  const { agencyId } = await params;
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();
  const now = new Date();
  const currentStart = fourteenDaysAgo(now);
  const previousStart = fourteenDaysAgo(currentStart);
  const currentStartISO = currentStart.toISOString();
  const previousStartISO = previousStart.toISOString();
  const nowISO = now.toISOString();

  // ── Parallel data fetch ────────────────────────────────────────────────

  const [
    { data: agency },
    { data: stages },
    { data: candidates },
    { data: stageChanges },
    { data: activities },
    { data: openTasks },
    { data: problems },
    { data: lessonProgress },
    { data: totalLessons },
    { data: kpiDefaults },
    { data: kpiOverrides },
  ] = await Promise.all([
    admin.from('agencies').select('*').eq('id', agencyId).single(),
    admin.from('pipeline_stages').select('id, name, sort_order').or(`agency_id.eq.${agencyId},agency_id.is.null`).order('sort_order'),
    admin.from('candidates').select('id, created_at, first_contact_at, ttfc_seconds, current_stage_id, source').eq('agency_id', agencyId),
    admin.from('candidate_stages').select('candidate_id, stage_id, changed_at').eq('candidate_id', agencyId),
    admin.from('activity_log').select('id, action, action_type, created_at, metadata').eq('agency_id', agencyId).gte('created_at', currentStartISO).order('created_at', { ascending: false }),
    admin.from('fulfillment_tasks').select('id, title, status, task_type').eq('agency_id', agencyId).not('status', 'in', '("done","skipped")'),
    admin.from('agency_problems').select('id, problem_key, severity, current_value, target_value, detected_at').eq('agency_id', agencyId).is('resolved_at', null),
    admin.from('agency_lesson_progress').select('lesson_id, watched, completed_at').eq('agency_id', agencyId),
    admin.from('masterclass_lessons').select('id', { count: 'exact', head: true }),
    admin.from('kpi_defaults').select('*'),
    admin.from('agency_kpi_overrides').select('*').eq('agency_id', agencyId),
  ]);

  if (!agency) {
    return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
  }

  // We need candidate_stages for this agency's candidates, not filtered by agencyId directly
  const candidateIds = (candidates || []).map((c) => c.id);
  let allStageChanges: { candidate_id: string; stage_id: string; changed_at: string }[] = [];
  if (candidateIds.length > 0) {
    // Fetch in batches of 200 to avoid query limits
    const batchSize = 200;
    for (let i = 0; i < candidateIds.length; i += batchSize) {
      const batch = candidateIds.slice(i, i + batchSize);
      const { data } = await admin
        .from('candidate_stages')
        .select('candidate_id, stage_id, changed_at')
        .in('candidate_id', batch);
      if (data) allStageChanges = allStageChanges.concat(data);
    }
  }

  // ── Build stage name map ─────────────────────────────────────────────────

  const stageNameMap: StageNameMap = new Map();
  const stageOrderMap = new Map<string, number>();
  for (const s of stages || []) {
    stageNameMap.set(s.id, s.name.toLowerCase());
    stageOrderMap.set(s.id, s.sort_order);
  }

  // Find stage IDs by name pattern
  const findStageId = (keyword: string): string | undefined => {
    for (const s of stages || []) {
      if (s.name.toLowerCase().includes(keyword.toLowerCase())) return s.id;
    }
    return undefined;
  };

  const eingangStageId = findStageId('eingang');
  const interviewStageId = findStageId('vorstellungsgespräch') ?? findStageId('vorstellungsgespr') ?? findStageId('interview');
  const probetagStageId = findStageId('probetag') ?? findStageId('probe');
  const eingestelltStageId = findStageId('eingestellt') ?? findStageId('hired');

  // ── Section 1: Zahlen (14-day comparison) ────────────────────────────────

  function countForPeriod(start: Date, end: Date) {
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    // New candidates in period
    const newCandidates = (candidates || []).filter(
      (c) => c.created_at >= startISO && c.created_at < endISO
    ).length;

    // Stage transitions in period
    const periodChanges = allStageChanges.filter(
      (sc) => sc.changed_at >= startISO && sc.changed_at < endISO
    );

    // Contacted = moved past "Eingang" (any stage change to a stage that is not Eingang)
    const contacted = eingangStageId
      ? periodChanges.filter((sc) => sc.stage_id !== eingangStageId).length
      : 0;

    // Interviews = reached interview stage
    const interviews = interviewStageId
      ? periodChanges.filter((sc) => sc.stage_id === interviewStageId).length
      : 0;

    // Trials = reached Probetag stage
    const trials = probetagStageId
      ? periodChanges.filter((sc) => sc.stage_id === probetagStageId).length
      : 0;

    // Hired = reached Eingestellt stage
    const hired = eingestelltStageId
      ? periodChanges.filter((sc) => sc.stage_id === eingestelltStageId).length
      : 0;

    // Median TTFC for candidates created in period
    const ttfcValues = (candidates || [])
      .filter((c) => c.created_at >= startISO && c.created_at < endISO && c.ttfc_seconds != null)
      .map((c) => c.ttfc_seconds as number);
    const median_ttfc_seconds = median(ttfcValues);

    return { new_candidates: newCandidates, contacted, interviews, trials, hired, median_ttfc_seconds };
  }

  const current = countForPeriod(currentStart, now);
  const previous = countForPeriod(previousStart, currentStart);

  const deltas = {
    new_candidates: pctChange(current.new_candidates, previous.new_candidates),
    contacted: pctChange(current.contacted, previous.contacted),
    interviews: pctChange(current.interviews, previous.interviews),
    trials: pctChange(current.trials, previous.trials),
    hired: pctChange(current.hired, previous.hired),
    median_ttfc_seconds:
      current.median_ttfc_seconds != null && previous.median_ttfc_seconds != null
        ? pctChange(current.median_ttfc_seconds, previous.median_ttfc_seconds)
        : null,
  };

  // ── Section 2: Activities (last 14 days) ─────────────────────────────────

  const activityMap = new Map<string, { count: number; recent: { action: string; created_at: string }[] }>();
  for (const a of activities || []) {
    const existing = activityMap.get(a.action_type);
    if (existing) {
      existing.count++;
      if (existing.recent.length < 5) {
        existing.recent.push({ action: a.action, created_at: a.created_at });
      }
    } else {
      activityMap.set(a.action_type, {
        count: 1,
        recent: [{ action: a.action, created_at: a.created_at }],
      });
    }
  }
  const activityGroups = Array.from(activityMap.entries()).map(([type, data]) => ({
    type,
    count: data.count,
    recent: data.recent,
  }));

  // ── Section 3: Open items ────────────────────────────────────────────────

  const completedLessons = (lessonProgress || []).filter((l) => l.watched && l.completed_at).length;
  const totalLessonCount = totalLessons?.length ?? 0;

  // SLA: Median TTFC of last 14 days' candidates, compared to KPI target
  const overrideMap = new Map((kpiOverrides || []).map((o) => [o.kpi_key, o.value]));
  const ttfcKpi = (kpiDefaults || []).find((k) => k.kpi_key === 'max_response_hours');
  const ttfcTargetHours = overrideMap.has('max_response_hours')
    ? overrideMap.get('max_response_hours')!
    : (ttfcKpi?.default_value ?? 24);
  const ttfcTargetSeconds = ttfcTargetHours * 3600;

  const recentTtfcValues = (candidates || [])
    .filter((c) => c.created_at >= currentStartISO && c.ttfc_seconds != null)
    .map((c) => c.ttfc_seconds as number);
  const medianTtfc = median(recentTtfcValues);
  const ttfcStatus: 'green' | 'yellow' | 'red' =
    medianTtfc === null
      ? 'green'
      : medianTtfc <= ttfcTargetSeconds
        ? 'green'
        : medianTtfc <= ttfcTargetSeconds * 1.5
          ? 'yellow'
          : 'red';

  const openItems = {
    fulfillment_tasks: (openTasks || []).map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      task_type: t.task_type,
    })),
    problems: (problems || []).map((p) => ({
      id: p.id,
      problem_key: p.problem_key,
      severity: p.severity,
      current_value: p.current_value,
      target_value: p.target_value,
    })),
    masterclass: {
      completed: completedLessons,
      total: totalLessonCount,
    },
    sla: {
      median_ttfc_seconds: medianTtfc,
      target_seconds: ttfcTargetSeconds,
      status: ttfcStatus,
    },
  };

  // ── Section 4: Diagnose (bottleneck detection) ───────────────────────────

  function detectBottleneck(): { bottleneck: string; detail: string; severity: 'green' | 'yellow' | 'red' } {
    const { new_candidates, contacted, interviews, trials, hired } = current;

    // Thresholds for "too few" — we use relative conversion rates
    if (new_candidates < 3) {
      return {
        bottleneck: 'Zu wenig Bewerbungen',
        detail: `Nur ${new_candidates} neue Bewerbungen in den letzten 14 Tagen. Mindestens 5 werden empfohlen.`,
        severity: new_candidates === 0 ? 'red' : 'yellow',
      };
    }

    const contactRate = new_candidates > 0 ? contacted / new_candidates : 0;
    if (contactRate < 0.5) {
      return {
        bottleneck: 'Erstkontakt zu langsam',
        detail: `Nur ${Math.round(contactRate * 100)}% der Bewerber wurden kontaktiert. TTFC-Median: ${medianTtfc ? Math.round(medianTtfc / 3600) + 'h' : 'keine Daten'}.`,
        severity: contactRate < 0.3 ? 'red' : 'yellow',
      };
    }

    const interviewRate = contacted > 0 ? interviews / contacted : 0;
    if (interviewRate < 0.3) {
      return {
        bottleneck: 'Vorqualifizierung stockt',
        detail: `Nur ${Math.round(interviewRate * 100)}% der kontaktierten Bewerber kommen zum Vorstellungsgespräch.`,
        severity: interviewRate < 0.15 ? 'red' : 'yellow',
      };
    }

    const trialRate = interviews > 0 ? trials / interviews : 0;
    if (trialRate < 0.3) {
      return {
        bottleneck: 'Vorstellungsgespräche konvertieren nicht',
        detail: `Nur ${Math.round(trialRate * 100)}% der Interviews führen zum Probetag.`,
        severity: trialRate < 0.15 ? 'red' : 'yellow',
      };
    }

    const hireRate = trials > 0 ? hired / trials : 0;
    if (trials > 0 && hireRate < 0.4) {
      return {
        bottleneck: 'Probetage führen nicht zur Einstellung',
        detail: `Nur ${Math.round(hireRate * 100)}% der Probetage enden mit Einstellung.`,
        severity: hireRate < 0.2 ? 'red' : 'yellow',
      };
    }

    return {
      bottleneck: 'Funnel läuft — Skalierung möglich',
      detail: `${new_candidates} Bewerbungen, ${hired} Einstellungen. Alle Conversion-Rates im grünen Bereich.`,
      severity: 'green',
    };
  }

  const diagnose = detectBottleneck();

  // ── Section 5: Upsell focus ──────────────────────────────────────────────

  function detectUpsell(): {
    blocked: boolean;
    reason?: string;
    suggestions: { product: string; trigger: string; price: string }[];
  } {
    // If SLA is red, block all upselling
    if (ttfcStatus === 'red') {
      return { blocked: true, reason: 'Erstkontakt-SLA rot', suggestions: [] };
    }

    const suggestions: { product: string; trigger: string; price: string }[] = [];

    // First hires exist -> Imagefilm / Social Media
    const totalHired = (candidates || []).filter((c) => {
      if (!eingestelltStageId) return false;
      return c.current_stage_id === eingestelltStageId;
    }).length;
    if (totalHired > 0) {
      suggestions.push({
        product: 'Imagefilm / Social Media Paket',
        trigger: `${totalHired} Einstellung(en) vorhanden — Arbeitgebermarke stärken`,
        price: 'ab 2.500 €',
      });
    }

    // Candidate volume > structure (many candidates but low hire rate)
    const totalCandidates = (candidates || []).length;
    if (totalCandidates > 30 && totalHired < totalCandidates * 0.1) {
      suggestions.push({
        product: 'CRM / Prozessberatung',
        trigger: `${totalCandidates} Bewerber, aber nur ${totalHired} Einstellungen — Struktur fehlt`,
        price: 'ab 1.500 €',
      });
    }

    // Check for career page
    const hasCareerPage = agency.career_page_url || agency.website_url;
    if (!hasCareerPage) {
      suggestions.push({
        product: 'Karriere-Website',
        trigger: 'Keine Karriereseite vorhanden',
        price: 'ab 3.000 €',
      });
    }

    // Scaling with process bottleneck
    if (diagnose.severity !== 'green' && totalCandidates > 20) {
      suggestions.push({
        product: 'Recruiting-Workshop',
        trigger: `Skalierungsbedarf bei ${diagnose.bottleneck}`,
        price: 'ab 1.200 €',
      });
    }

    return { blocked: false, suggestions };
  }

  const upsell = detectUpsell();

  // ── Section 6: Next steps ────────────────────────────────────────────────

  function generateNextSteps(): { action: string; owner: 'kunde' | 'team' | 'felix'; deadline: string }[] {
    const steps: { action: string; owner: 'kunde' | 'team' | 'felix'; deadline: string }[] = [];

    // Based on diagnosis
    if (diagnose.bottleneck === 'Zu wenig Bewerbungen') {
      steps.push({
        action: 'Anzeigen-Performance prüfen und ggf. Creatives tauschen',
        owner: 'team',
        deadline: addDays(now, 3),
      });
      steps.push({
        action: 'Indeed-Anzeige überprüfen und Budget anpassen',
        owner: 'team',
        deadline: addDays(now, 5),
      });
    }

    if (diagnose.bottleneck === 'Erstkontakt zu langsam') {
      steps.push({
        action: 'Bewerber innerhalb von 24h anrufen — Erstkontakt-Routine einführen',
        owner: 'kunde',
        deadline: addDays(now, 2),
      });
      steps.push({
        action: 'Telefonskript reviewen und ggf. anpassen',
        owner: 'team',
        deadline: addDays(now, 5),
      });
    }

    if (diagnose.bottleneck === 'Vorqualifizierung stockt') {
      steps.push({
        action: 'Leitfaden für Erstgespräch überarbeiten',
        owner: 'team',
        deadline: addDays(now, 5),
      });
      steps.push({
        action: 'Auswahlkriterien mit Kunden abstimmen',
        owner: 'felix',
        deadline: addDays(now, 7),
      });
    }

    if (diagnose.bottleneck === 'Vorstellungsgespräche konvertieren nicht') {
      steps.push({
        action: 'VG-Feedback sammeln — warum sagen Bewerber ab?',
        owner: 'kunde',
        deadline: addDays(now, 5),
      });
      steps.push({
        action: 'VG-Leitfaden anpassen',
        owner: 'team',
        deadline: addDays(now, 7),
      });
    }

    if (diagnose.bottleneck === 'Probetage führen nicht zur Einstellung') {
      steps.push({
        action: 'Probetag-Ablauf mit Kunden besprechen',
        owner: 'felix',
        deadline: addDays(now, 3),
      });
      steps.push({
        action: 'Onboarding-Prozess überprüfen',
        owner: 'kunde',
        deadline: addDays(now, 7),
      });
    }

    if (diagnose.bottleneck === 'Funnel läuft — Skalierung möglich') {
      steps.push({
        action: 'Budget-Erhöhung besprechen für mehr Reichweite',
        owner: 'felix',
        deadline: addDays(now, 7),
      });
    }

    // Add open tasks based action
    if ((openTasks || []).length > 3) {
      steps.push({
        action: `${(openTasks || []).length} offene Fulfillment-Aufgaben abarbeiten`,
        owner: 'team',
        deadline: addDays(now, 5),
      });
    }

    // Masterclass nudge
    if (completedLessons < totalLessonCount && totalLessonCount > 0) {
      steps.push({
        action: `Masterclass weiter bearbeiten (${completedLessons}/${totalLessonCount} Lektionen)`,
        owner: 'kunde',
        deadline: addDays(now, 14),
      });
    }

    // Return max 3
    return steps.slice(0, 3);
  }

  const nextSteps = generateNextSteps();

  // ── Betreuungsstufe ──────────────────────────────────────────────────────

  const daysActive = Math.floor(
    (now.getTime() - new Date(agency.created_at).getTime()) / 86400000
  );
  const betreuungsstufe = daysActive <= 90 ? 'A' : 'B';

  // ── Response ─────────────────────────────────────────────────────────────

  return NextResponse.json({
    agency: {
      id: agency.id,
      name: agency.name,
      contact_name: agency.contact_name,
      created_at: agency.created_at,
    },
    generated_at: nowISO,
    betreuungsstufe,
    days_active: daysActive,
    period: {
      current: { start: currentStartISO, end: nowISO },
      previous: { start: previousStartISO, end: currentStartISO },
    },
    zahlen: { current, previous, deltas },
    activities: activityGroups,
    open_items: openItems,
    diagnose,
    upsell,
    next_steps: nextSteps,
  });
}
