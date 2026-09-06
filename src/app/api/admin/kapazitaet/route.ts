import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { computeBetreuungsstufe } from '@/lib/fulfillment/betreuung';
import { NextResponse } from 'next/server';

export interface AgencyCapacity {
  agency_id: string;
  agency_name: string;
  betreuungsstufe: 'A' | 'B';
  open_tasks: number;
  overdue_tasks: number;
  active_problems: number;
  critical_problems: number;
  open_approvals: number;
  last_activity: string | null;
  load_score: number;
  load_level: 'gruen' | 'gelb' | 'rot';
}

export async function GET() {
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();
  const todayStr = new Date().toISOString().split('T')[0];

  const [agenciesResult, tasksResult, problemsResult, approvalsResult, activityResult] =
    await Promise.all([
      admin.from('agencies').select('id, name, created_at').order('name'),
      admin
        .from('unified_tasks')
        .select('agency_id, due_date')
        .neq('status', 'done')
        .neq('status', 'skipped'),
      admin
        .from('agency_problems')
        .select('agency_id, severity')
        .is('resolved_at', null),
      admin
        .from('content_library')
        .select('agency_id')
        .in('status', ['internal_review', 'approved_internal']),
      admin
        .from('activity_log')
        .select('agency_id, created_at')
        .order('created_at', { ascending: false })
        .limit(2000),
    ]);

  const agencies = agenciesResult.data ?? [];
  if (!agencies.length) return NextResponse.json({ agencies: [], stats: null });

  // Aggregation pro Agentur
  const openTasks = new Map<string, number>();
  const overdueTasks = new Map<string, number>();
  for (const t of tasksResult.data ?? []) {
    if (!t.agency_id) continue;
    openTasks.set(t.agency_id, (openTasks.get(t.agency_id) ?? 0) + 1);
    if (t.due_date && t.due_date < todayStr) {
      overdueTasks.set(t.agency_id, (overdueTasks.get(t.agency_id) ?? 0) + 1);
    }
  }

  const problems = new Map<string, number>();
  const criticalProblems = new Map<string, number>();
  for (const p of problemsResult.data ?? []) {
    problems.set(p.agency_id, (problems.get(p.agency_id) ?? 0) + 1);
    if (p.severity === 'critical') {
      criticalProblems.set(p.agency_id, (criticalProblems.get(p.agency_id) ?? 0) + 1);
    }
  }

  const approvals = new Map<string, number>();
  for (const a of approvalsResult.data ?? []) {
    if (!a.agency_id) continue;
    approvals.set(a.agency_id, (approvals.get(a.agency_id) ?? 0) + 1);
  }

  // Letzte Aktivität: activityResult ist created_at DESC → erster Treffer gewinnt
  const lastActivity = new Map<string, string>();
  for (const a of activityResult.data ?? []) {
    if (a.agency_id && !lastActivity.has(a.agency_id)) {
      lastActivity.set(a.agency_id, a.created_at);
    }
  }

  const result: AgencyCapacity[] = agencies.map((agency) => {
    const open = openTasks.get(agency.id) ?? 0;
    const overdue = overdueTasks.get(agency.id) ?? 0;
    const probs = problems.get(agency.id) ?? 0;
    const critical = criticalProblems.get(agency.id) ?? 0;
    const appr = approvals.get(agency.id) ?? 0;

    const daysActive = Math.floor(
      (Date.now() - new Date(agency.created_at).getTime()) / 86400000
    );
    const betreuungsstufe = computeBetreuungsstufe(daysActive, probs);

    // Lastindex: kritische Probleme wiegen am schwersten, dann Überfälliges
    const loadScore = critical * 5 + overdue * 3 + (probs - critical) * 2 + appr + open;
    const loadLevel: AgencyCapacity['load_level'] =
      critical > 0 || loadScore >= 15 ? 'rot' : loadScore >= 6 ? 'gelb' : 'gruen';

    return {
      agency_id: agency.id,
      agency_name: agency.name,
      betreuungsstufe,
      open_tasks: open,
      overdue_tasks: overdue,
      active_problems: probs,
      critical_problems: critical,
      open_approvals: appr,
      last_activity: lastActivity.get(agency.id) ?? null,
      load_score: loadScore,
      load_level: loadLevel,
    };
  });

  // Höchste Last zuerst
  result.sort((a, b) => b.load_score - a.load_score);

  const stats = {
    total_agencies: result.length,
    total_open_tasks: result.reduce((s, r) => s + r.open_tasks, 0),
    total_overdue: result.reduce((s, r) => s + r.overdue_tasks, 0),
    total_problems: result.reduce((s, r) => s + r.active_problems, 0),
    rot: result.filter((r) => r.load_level === 'rot').length,
    gelb: result.filter((r) => r.load_level === 'gelb').length,
    gruen: result.filter((r) => r.load_level === 'gruen').length,
    stufe_a: result.filter((r) => r.betreuungsstufe === 'A').length,
  };

  return NextResponse.json({ agencies: result, stats });
}
