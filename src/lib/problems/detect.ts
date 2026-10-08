import { SupabaseClient } from '@supabase/supabase-js';

interface EffectiveKpi {
  key: string;
  value: number;
  direction: string;
}

interface ProblemCheck {
  key: string;
  kpiKey: string;
  severity: 'warning' | 'critical';
  check: (supabase: SupabaseClient, agencyId: string, target: number) => Promise<{ triggered: boolean; currentValue: number }>;
}

async function getEffectiveKpis(supabase: SupabaseClient, agencyId: string): Promise<Map<string, EffectiveKpi>> {
  const [{ data: defaults }, { data: overrides }] = await Promise.all([
    supabase.from('kpi_defaults').select('*'),
    supabase.from('agency_kpi_overrides').select('*').eq('agency_id', agencyId),
  ]);

  const overrideMap = new Map((overrides || []).map((o) => [o.kpi_key, o.value]));
  const result = new Map<string, EffectiveKpi>();

  for (const d of defaults || []) {
    result.set(d.kpi_key, {
      key: d.kpi_key,
      value: overrideMap.has(d.kpi_key) ? overrideMap.get(d.kpi_key)! : d.default_value,
      direction: d.direction,
    });
  }
  return result;
}

/** Alle Zeilen seitenweise laden (PostgREST liefert höchstens 1000 je Abfrage). */
async function alleSeiten<T>(
  abfrage: (von: number, bis: number) => PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const seite = 1000;
  const alle: T[] = [];
  for (let von = 0; von < 50_000; von += seite) {
    const { data, error } = await abfrage(von, von + seite - 1);
    if (error) throw new Error(error.message);
    alle.push(...((data ?? []) as T[]));
    if (!data || data.length < seite) break;
  }
  return alle;
}

const sevenDaysAgo = () => new Date(Date.now() - 7 * 86400000).toISOString();
const twoDaysAgo = () => new Date(Date.now() - 2 * 86400000).toISOString();
const threeDaysAgo = () => new Date(Date.now() - 3 * 86400000).toISOString();
const fiveDaysAgo = () => new Date(Date.now() - 5 * 86400000).toISOString();
const oneDayAgo = () => new Date(Date.now() - 86400000).toISOString();

const problemChecks: ProblemCheck[] = [
  {
    key: 'low_reach_rate',
    kpiKey: 'min_reach_rate',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      const { data: calls } = await supabase
        .from('call_logs')
        .select('result')
        .eq('agency_id', agencyId)
        .gte('created_at', sevenDaysAgo());
      if (!calls || calls.length < 5) return { triggered: false, currentValue: 0 };
      const reached = calls.filter((c) => c.result !== 'nicht_erreicht').length;
      const rate = Math.round((reached / calls.length) * 100);
      return { triggered: rate < target, currentValue: rate };
    },
  },
  {
    key: 'low_termin_rate',
    kpiKey: 'min_termin_rate',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      const { data: calls } = await supabase
        .from('call_logs')
        .select('result')
        .eq('agency_id', agencyId)
        .gte('created_at', sevenDaysAgo());
      if (!calls || calls.length < 5) return { triggered: false, currentValue: 0 };
      const termine = calls.filter((c) => c.result === 'termin_vereinbart').length;
      const rate = Math.round((termine / calls.length) * 100);
      return { triggered: rate < target, currentValue: rate };
    },
  },
  {
    key: 'high_cpl',
    kpiKey: 'max_cpl',
    severity: 'critical',
    check: async (supabase, agencyId, target) => {
      const { data: reports } = await supabase
        .from('meta_ad_reports')
        .select('cpl')
        .eq('agency_id', agencyId)
        .gte('report_date', sevenDaysAgo().split('T')[0])
        .not('cpl', 'is', null);
      if (!reports || reports.length === 0) return { triggered: false, currentValue: 0 };
      const avgCpl = reports.reduce((s, r) => s + r.cpl, 0) / reports.length;
      return { triggered: avgCpl > target, currentValue: Math.round(avgCpl * 100) / 100 };
    },
  },
  {
    key: 'low_candidates',
    kpiKey: 'min_candidates_week',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      const { count } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .gte('created_at', sevenDaysAgo());
      return { triggered: (count || 0) < target, currentValue: count || 0 };
    },
  },
  {
    key: 'no_calls_24h',
    kpiKey: 'max_response_hours',
    severity: 'critical',
    check: async (supabase, agencyId) => {
      const { count: openCandidates } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId);
      if (!openCandidates || openCandidates === 0) return { triggered: false, currentValue: 0 };

      const { count: recentCalls } = await supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .gte('created_at', oneDayAgo());
      return { triggered: (recentCalls || 0) === 0, currentValue: recentCalls || 0 };
    },
  },
  {
    key: 'pipeline_stall',
    kpiKey: 'max_phase_days',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      // candidate_stages ist ein Verlauf: entscheidend ist nur die letzte Phase je Kandidat.
      // Hängend = aktiver Kandidat (nicht gelöscht, nicht in Endphase), der seit target Tagen nicht bewegt wurde.
      if (target <= 0) return { triggered: false, currentValue: 0 };
      const cutoff = new Date(Date.now() - target * 86400000).toISOString();

      const { data: endStages } = await supabase
        .from('pipeline_stages')
        .select('id')
        .in('stage_type', ['hired', 'rejected']);
      const endStageIds = new Set(((endStages ?? []) as Array<{ id: string }>).map((s) => s.id));

      const aktive = await alleSeiten<{ id: string; current_stage_id: string }>((von, bis) =>
        supabase
          .from('candidates')
          .select('id, current_stage_id')
          .eq('agency_id', agencyId)
          .is('deleted_at', null)
          .lt('created_at', cutoff)
          .order('id')
          .range(von, bis)
      );
      const kandidaten = aktive.filter((c) => !endStageIds.has(c.current_stage_id));
      if (kandidaten.length === 0) return { triggered: false, currentValue: 0 };

      const bewegt = await alleSeiten<{ candidate_id: string }>((von, bis) =>
        supabase
          .from('candidate_stages')
          .select('candidate_id, candidates!inner(agency_id)')
          .eq('candidates.agency_id', agencyId)
          .gte('changed_at', cutoff)
          .order('id')
          .range(von, bis)
      );
      const kuerzlichBewegt = new Set(bewegt.map((s) => s.candidate_id));
      const stalledCount = kandidaten.filter((c) => !kuerzlichBewegt.has(c.id)).length;
      return { triggered: stalledCount > 0, currentValue: stalledCount };
    },
  },
  {
    key: 'low_satisfaction',
    kpiKey: 'min_satisfaction',
    severity: 'critical',
    check: async (supabase, agencyId, target) => {
      const { data: responses } = await supabase
        .from('survey_responses')
        .select('rating')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (!responses || responses.length === 0) return { triggered: false, currentValue: 0 };
      const rating = responses[0].rating ?? 0;
      return { triggered: rating < target, currentValue: rating };
    },
  },
  {
    key: 'indeed_no_candidates',
    kpiKey: 'min_indeed_per_2days',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      // Check: min 10 Indeed-Bewerber in 3 Tagen
      const { count } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .eq('source', 'indeed')
        .gte('created_at', threeDaysAgo());
      return { triggered: (count || 0) < target, currentValue: count || 0 };
    },
  },
  {
    key: 'low_meta_leads',
    kpiKey: 'min_meta_leads_5days',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      // Check: min 5 Meta-Leads in 5 Tagen
      const { count } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .eq('source', 'meta')
        .gte('created_at', fiveDaysAgo());
      return { triggered: (count || 0) < target, currentValue: count || 0 };
    },
  },
  {
    key: 'assets_leer',
    kpiKey: 'min_assets_ready',
    severity: 'warning',
    check: async (supabase, agencyId, target) => {
      // Asset-Halde: freigegebene, noch nicht aktivierte Inhalte (status = approved).
      // Nur für Agenturen, die bereits live sind (mind. 1 aktiviertes Asset).
      // Fallback-Ziel 2, falls kein KPI-Default konfiguriert ist.
      const effectiveTarget = target > 0 ? target : 2;
      const { count: deployedCount } = await supabase
        .from('content_library')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .eq('status', 'deployed');
      if (!deployedCount || deployedCount === 0) return { triggered: false, currentValue: 0 };

      const { count } = await supabase
        .from('content_library')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .eq('status', 'approved');
      return { triggered: (count || 0) < effectiveTarget, currentValue: count || 0 };
    },
  },
];

export async function detectProblemsForAgency(
  supabase: SupabaseClient,
  agencyId: string
): Promise<{ detected: number; resolved: number }> {
  const kpis = await getEffectiveKpis(supabase, agencyId);
  let detected = 0;
  let resolved = 0;

  // Checks sind unabhängig voneinander – parallel ausführen, danach der Reihe nach verbuchen
  const ergebnisse = await Promise.all(
    problemChecks.map(async (check) => {
      const target = kpis.get(check.kpiKey)?.value ?? 0;
      try {
        return { check, target, result: await check.check(supabase, agencyId, target) };
      } catch (err) {
        console.error(`[problems] Check ${check.key} fehlgeschlagen:`, err);
        return null;
      }
    })
  );

  for (const eintrag of ergebnisse) {
    if (!eintrag) continue;
    const { check, target, result } = eintrag;
    const { data: existing } = await supabase
      .from('agency_problems')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('problem_key', check.key)
      .is('resolved_at', null)
      .limit(1);

    if (result.triggered && (!existing || existing.length === 0)) {
      const { data: newProblem } = await supabase
        .from('agency_problems')
        .insert({
          agency_id: agencyId,
          problem_key: check.key,
          severity: check.severity,
          current_value: result.currentValue,
          target_value: target,
        })
        .select('id')
        .single();

      // Auto-create playbook tasks from immediate_actions
      if (newProblem) {
        const { data: playbook } = await supabase
          .from('playbook_entries')
          .select('immediate_actions')
          .eq('problem_key', check.key)
          .single();

        if (playbook && Array.isArray(playbook.immediate_actions) && playbook.immediate_actions.length > 0) {
          const taskRows = playbook.immediate_actions.map((action: string) => ({
            agency_id: agencyId,
            problem_id: newProblem.id,
            playbook_key: check.key,
            action_text: action,
            action_type: 'immediate',
          }));
          await supabase.from('playbook_tasks').insert(taskRows);
        }
      }

      detected++;
    } else if (!result.triggered && existing && existing.length > 0) {
      await supabase
        .from('agency_problems')
        .update({ resolved_at: new Date().toISOString() })
        .eq('id', existing[0].id);
      resolved++;
    } else if (result.triggered && existing && existing.length > 0) {
      await supabase
        .from('agency_problems')
        .update({ current_value: result.currentValue })
        .eq('id', existing[0].id);
    }
  }

  return { detected, resolved };
}
