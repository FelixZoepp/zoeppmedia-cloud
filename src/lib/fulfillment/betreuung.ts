import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Betreuungsstufen (Blueprint v2):
 * - Stufe A: erste 90 Tage ODER aktive Probleme (Health gelb/rot) → Fahrplan-Call alle 14 Tage
 * - Stufe B: nach 90 Tagen stabil → Fahrplan-Call monatlich, Fahrplan weiter alle 14 Tage schriftlich
 */
export function computeBetreuungsstufe(daysActive: number, activeProblems: number): 'A' | 'B' {
  return daysActive <= 90 || activeProblems > 0 ? 'A' : 'B';
}

export const CALL_INTERVAL_DAYS: Record<'A' | 'B', number> = { A: 14, B: 30 };

/**
 * Legt fällige Fahrplan-Call-Aufgaben pro Agentur an (recurring_fulfillment_tasks,
 * task_key 'fahrplan_call'). Erscheint über unified_tasks automatisch auf der
 * Heute-Seite. Dedupe: keine neue Aufgabe, solange eine offene existiert oder
 * die letzte jünger als das Stufen-Intervall ist.
 */
export async function ensureFahrplanCallTasks(supabase: SupabaseClient): Promise<number> {
  const [{ data: agencies }, { data: problems }] = await Promise.all([
    supabase
      .from('agencies')
      .select('id, name, created_at, onboarding_completed')
      .eq('onboarding_completed', true),
    supabase.from('agency_problems').select('agency_id').is('resolved_at', null),
  ]);

  if (!agencies?.length) return 0;

  const problemCounts = new Map<string, number>();
  for (const p of problems ?? []) {
    problemCounts.set(p.agency_id, (problemCounts.get(p.agency_id) ?? 0) + 1);
  }

  const now = new Date();
  const todayStr = now.toISOString().split('T')[0];
  let created = 0;

  for (const agency of agencies) {
    const daysActive = Math.floor((now.getTime() - new Date(agency.created_at).getTime()) / 86400000);
    // Erster Fahrplan-Call frühestens ab Tag 14 (davor: Onboarding + Kickoff)
    if (daysActive < 14) continue;

    const stufe = computeBetreuungsstufe(daysActive, problemCounts.get(agency.id) ?? 0);
    const intervalMs = CALL_INTERVAL_DAYS[stufe] * 86400000;

    const { data: lastTask } = await supabase
      .from('recurring_fulfillment_tasks')
      .select('status, created_at')
      .eq('agency_id', agency.id)
      .eq('task_key', 'fahrplan_call')
      .order('created_at', { ascending: false })
      .limit(1);

    const last = lastTask?.[0];
    const hasOpen = last && last.status !== 'done' && last.status !== 'skipped';
    const tooRecent = last && now.getTime() - new Date(last.created_at).getTime() < intervalMs;
    if (hasOpen || tooRecent) continue;

    await supabase.from('recurring_fulfillment_tasks').insert({
      agency_id: agency.id,
      task_key: 'fahrplan_call',
      title: `Fahrplan-Call: ${agency.name} (Stufe ${stufe})`,
      status: 'pending',
      due_date: todayStr,
      triggered_by: 'schedule',
    });
    created++;
  }

  return created;
}
