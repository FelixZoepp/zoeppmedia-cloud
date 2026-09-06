import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  const fifteenMinAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

  const internal = isInternal(user.role);

  // --- Overdue tasks ---
  let overdueQuery = supabase
    .from('unified_tasks')
    .select('*')
    .lt('due_date', todayStr)
    .neq('status', 'done')
    .neq('status', 'skipped')
    .order('due_date', { ascending: true })
    .limit(50);

  if (!internal && user.agency_id) {
    overdueQuery = overdueQuery.eq('agency_id', user.agency_id);
  } else if (!internal) {
    return NextResponse.json({ error: 'No agency assigned' }, { status: 403 });
  }

  // --- Due today ---
  let dueTodayQuery = supabase
    .from('unified_tasks')
    .select('*')
    .eq('due_date', todayStr)
    .neq('status', 'done')
    .neq('status', 'skipped')
    .order('created_at', { ascending: false })
    .limit(50);

  if (!internal && user.agency_id) {
    dueTodayQuery = dueTodayQuery.eq('agency_id', user.agency_id);
  }

  // --- New candidates in last 15 min without first_dial_at ---
  let newCandidatesQuery = supabase
    .from('candidates')
    .select('id, name, phone, agency_id, created_at')
    .gte('created_at', fifteenMinAgo)
    .is('first_dial_at', null)
    .order('created_at', { ascending: false })
    .limit(20);

  if (!internal && user.agency_id) {
    newCandidatesQuery = newCandidatesQuery.eq('agency_id', user.agency_id);
  }

  // --- Callbacks due today ---
  let callbacksQuery = supabase
    .from('call_logs')
    .select('id, candidate_id, agency_id, notes, next_contact_date, created_at')
    .eq('next_step', 'erneut_anrufen')
    .lte('next_contact_date', todayStr)
    .order('next_contact_date', { ascending: true })
    .limit(50);

  if (!internal && user.agency_id) {
    callbacksQuery = callbacksQuery.eq('agency_id', user.agency_id);
  }

  // --- Heutige Calendly-Termine (Kunden-Calls → Fahrplan, Bewerber-Termine) ---
  let callsQuery = supabase
    .from('calendly_events')
    .select('id, agency_id, candidate_id, event_name, invitee_name, start_time')
    .gte('start_time', `${todayStr}T00:00:00.000Z`)
    .lte('start_time', `${todayStr}T23:59:59.999Z`)
    .eq('status', 'scheduled')
    .order('start_time', { ascending: true })
    .limit(50);

  if (!internal && user.agency_id) {
    callsQuery = callsQuery.eq('agency_id', user.agency_id);
  }

  // --- Active problems (alert inbox) ---
  let problemsQuery = supabase
    .from('agency_problems')
    .select('id, agency_id, problem_key, severity, current_value, target_value, detected_at')
    .is('resolved_at', null)
    .order('detected_at', { ascending: false })
    .limit(50);

  if (!internal && user.agency_id) {
    problemsQuery = problemsQuery.eq('agency_id', user.agency_id);
  }

  // Run all queries in parallel
  const [overdueResult, dueTodayResult, newCandidatesResult, callbacksResult, problemsResult, callsResult] =
    await Promise.all([
      overdueQuery,
      dueTodayQuery,
      newCandidatesQuery,
      callbacksQuery,
      problemsQuery,
      callsQuery,
    ]);

  // Kritische Probleme zuerst
  const problems = (problemsResult.data ?? []).sort((a, b) =>
    a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1
  );

  // --- Namen auflösen (Agenturen + Rückruf-Kandidaten) statt UUID-Präfixe ---
  const agencyIds = new Set<string>();
  for (const list of [overdueResult.data, dueTodayResult.data, newCandidatesResult.data, callbacksResult.data, problems, callsResult.data]) {
    for (const item of list ?? []) {
      if (item.agency_id) agencyIds.add(item.agency_id);
    }
  }
  const callbackCandidateIds = [...new Set((callbacksResult.data ?? []).map((c) => c.candidate_id))];

  const [agenciesResult, callbackCandidatesResult] = await Promise.all([
    agencyIds.size > 0
      ? supabase.from('agencies').select('id, name').in('id', [...agencyIds])
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    callbackCandidateIds.length > 0
      ? supabase.from('candidates').select('id, name, phone').in('id', callbackCandidateIds)
      : Promise.resolve({ data: [] as { id: string; name: string; phone: string | null }[] }),
  ]);

  const agencyNames: Record<string, string> = {};
  for (const a of agenciesResult.data ?? []) agencyNames[a.id] = a.name;

  const candidateNames: Record<string, { name: string; phone: string | null }> = {};
  for (const c of callbackCandidatesResult.data ?? []) candidateNames[c.id] = { name: c.name, phone: c.phone };

  // --- SLA stats for today ---
  const startOfDay = `${todayStr}T00:00:00.000Z`;
  const endOfDay = `${todayStr}T23:59:59.999Z`;

  // Open tasks count
  let openTasksQuery = supabase
    .from('unified_tasks')
    .select('id', { count: 'exact', head: true })
    .neq('status', 'done')
    .neq('status', 'skipped');

  if (!internal && user.agency_id) {
    openTasksQuery = openTasksQuery.eq('agency_id', user.agency_id);
  }

  // SLAs resolved today (met = resolved_at <= due_at)
  let slaResolvedQuery = supabase
    .from('task_sla')
    .select('id, due_at, resolved_at')
    .gte('resolved_at', startOfDay)
    .lte('resolved_at', endOfDay);

  if (!internal && user.agency_id) {
    slaResolvedQuery = slaResolvedQuery.eq('agency_id', user.agency_id);
  }

  // SLAs breached today (escalation_level > 0 and escalated today)
  let slaBreachedQuery = supabase
    .from('task_sla')
    .select('id', { count: 'exact', head: true })
    .gt('escalation_level', 0)
    .gte('escalated_at', startOfDay)
    .lte('escalated_at', endOfDay);

  if (!internal && user.agency_id) {
    slaBreachedQuery = slaBreachedQuery.eq('agency_id', user.agency_id);
  }

  const [openTasksResult, slaResolvedResult, slaBreachedResult] =
    await Promise.all([openTasksQuery, slaResolvedQuery, slaBreachedQuery]);

  // Calculate SLA met: resolved within the due_at window
  const resolvedSlas = slaResolvedResult.data ?? [];
  const slaMet = resolvedSlas.filter(
    (sla) =>
      sla.resolved_at &&
      sla.due_at &&
      new Date(sla.resolved_at) <= new Date(sla.due_at)
  ).length;

  return NextResponse.json({
    overdue: overdueResult.data ?? [],
    due_today: dueTodayResult.data ?? [],
    new_candidates_15min: newCandidatesResult.data ?? [],
    callbacks: callbacksResult.data ?? [],
    calls_today: callsResult.data ?? [],
    problems,
    agency_names: agencyNames,
    candidate_names: candidateNames,
    stats: {
      open_tasks: openTasksResult.count ?? 0,
      sla_met_today: slaMet,
      sla_breached_today: slaBreachedResult.count ?? 0,
      active_problems: problems.length,
    },
  });
}
