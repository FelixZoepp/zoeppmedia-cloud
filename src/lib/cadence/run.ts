import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification } from '@/lib/notifications/create';
import { getWindowTime } from './engine';
import { automatikAgencyIds } from '@/lib/fulfillment/automatik';

type CallWindow = 'morning' | 'afternoon' | 'evening';

/** Zeitstempel des letzten Kadenz-Laufs (system_einstellungen) */
export const KADENZ_LAUF_KEY = 'kadenz_letzter_lauf';
const INTERVALL_MS = 15 * 60 * 1000;
/** Länger überfällig = Zeitfenster verpasst → auf das nächste gleiche Fenster schieben statt jetzt anzurufen */
const VERPASST_MS = 3 * 60 * 60 * 1000;
const MAX_JE_LAUF = 200;

const WINDOW_LABEL: Record<CallWindow, string> = { morning: 'Vormittag', afternoon: 'Nachmittag', evening: 'Abend' };

interface DueCandidate {
  id: string;
  name: string;
  agency_id: string;
  cadence_attempt: number | null;
  cadence_next_window: CallWindow | null;
  cadence_next_at: string;
}

/** Nächster Termin im selben Zeitfenster, der nach `now` liegt */
export function naechstesFenster(now: Date, window: CallWindow): Date {
  const heute = getWindowTime(now, window);
  if (heute.getTime() > now.getTime()) return heute;
  return getWindowTime(new Date(now.getTime() + 24 * 60 * 60 * 1000), window);
}

/**
 * Fällige Kadenz-Anrufe in Aufgaben umwandeln.
 * Idempotent: Jeder Kandidat wird per bedingtem Update „beansprucht“ (cadence_next_at muss noch
 * den gelesenen Wert haben) – parallele oder schnell wiederholte Läufe legen keine doppelten Aufgaben an.
 */
export async function runCadence(
  supabase: SupabaseClient,
  now: Date = new Date(),
  opts: { agencyIds?: string[] } = {},
) {
  if (opts.agencyIds && !opts.agencyIds.length) return { dueCandidates: 0, tasksCreated: 0, verschoben: 0, notificationsSent: 0 };
  let query = supabase
    .from('candidates')
    .select('id, name, agency_id, cadence_attempt, cadence_next_window, cadence_next_at')
    .eq('cadence_active', true)
    .not('cadence_next_at', 'is', null)
    .lte('cadence_next_at', now.toISOString());
  if (opts.agencyIds) query = query.in('agency_id', opts.agencyIds);
  const { data, error } = await query
    .order('cadence_next_at', { ascending: true })
    .limit(MAX_JE_LAUF);
  if (error) throw new Error(`Kadenz: Kandidaten nicht ladbar: ${error.message}`);

  let tasksCreated = 0;
  let verschoben = 0;
  let notificationsSent = 0;
  const due = (data ?? []) as DueCandidate[];

  // Empfänger einmal laden statt je Kandidat
  const { data: employees } = due.length
    ? await supabase.from('users').select('id').in('role', ['admin', 'employee']).limit(5)
    : { data: [] as Array<{ id: string }> };

  for (const candidate of due) {
    try {
      const window: CallWindow = candidate.cadence_next_window ?? 'morning';

      // Fenster verpasst (z. B. Rückstau): nicht jetzt eine „Vormittag“-Aufgabe am Abend anlegen
      if (now.getTime() - new Date(candidate.cadence_next_at).getTime() > VERPASST_MS) {
        const { data: moved } = await supabase
          .from('candidates')
          .update({ cadence_next_at: naechstesFenster(now, window).toISOString() })
          .eq('id', candidate.id)
          .eq('cadence_next_at', candidate.cadence_next_at)
          .select('id');
        if ((moved ?? []).length) verschoben++;
        continue;
      }

      // Beanspruchen: nur wer cadence_next_at noch unverändert vorfindet, legt die Aufgabe an
      const { data: claimed } = await supabase
        .from('candidates')
        .update({ cadence_next_at: null })
        .eq('id', candidate.id)
        .eq('cadence_next_at', candidate.cadence_next_at)
        .select('id');
      if (!(claimed ?? []).length) continue;

      const attemptNumber = (candidate.cadence_attempt ?? 0) + 1;
      const windowLabel = WINDOW_LABEL[window];
      const isLastChance = attemptNumber === 6;

      await supabase.from('internal_tasks').insert({
        title: `Anrufversuch #${attemptNumber} ${isLastChance ? '(letzte Chance) ' : ''}— ${candidate.name}`,
        description: `Kadenz-Anruf im Zeitfenster: ${windowLabel}. ${isLastChance ? 'Letzter Versuch vor Kadenz-Ende.' : ''}`,
        agency_id: candidate.agency_id,
        status: 'todo',
        priority: isLastChance ? 'urgent' : 'high',
        due_date: now.toISOString().split('T')[0],
        created_by: null,
      });
      tasksCreated++;

      for (const employee of (employees ?? []) as Array<{ id: string }>) {
        await createNotification(supabase, {
          user_id: employee.id,
          agency_id: candidate.agency_id,
          title: `Kadenz-Anruf fällig: ${candidate.name}`,
          body: `Anrufversuch #${attemptNumber} (${windowLabel})${isLastChance ? ' — Letzte Chance!' : ''}`,
          type: 'task_due',
          entity_type: 'candidate',
          entity_id: candidate.id,
        });
        notificationsSent++;
      }
    } catch (err) {
      console.error('[cadence] Kandidat übersprungen', candidate.id, err);
    }
  }

  return { dueCandidates: due.length, tasksCreated, verschoben, notificationsSent };
}

/**
 * Kadenz höchstens alle 15 Minuten laufen lassen – gedacht für den minütlichen Tick.
 * Nur für Automatik-Kunden (agencies.automatik); alle anderen laufen weiter über den täglichen
 * Cron /api/cron/cadence mit dem alten Verhalten. Die Mengen sind disjunkt → keine doppelten Aufgaben.
 * Die Drosselung wird atomar beansprucht: Von zwei gleichzeitigen Aufrufen läuft nur einer.
 */
export async function runCadenceIfDue(supabase: SupabaseClient, now: Date = new Date()) {
  const agencyIds = await automatikAgencyIds(supabase);
  if (!agencyIds.length) return { skipped: true as const };

  const { data: row, error } = await supabase
    .from('system_einstellungen')
    .select('wert')
    .eq('key', KADENZ_LAUF_KEY)
    .maybeSingle();
  if (error) throw new Error(`Kadenz: Drosselung nicht lesbar: ${error.message}`);

  const letzter = (row as { wert: string } | null)?.wert ?? null;
  if (letzter) {
    const t = new Date(letzter).getTime();
    if (Number.isFinite(t) && now.getTime() - t < INTERVALL_MS) return { skipped: true as const };
    const { data: claimed } = await supabase
      .from('system_einstellungen')
      .update({ wert: now.toISOString(), updated_at: now.toISOString() })
      .eq('key', KADENZ_LAUF_KEY)
      .eq('wert', letzter)
      .select('key');
    if (!(claimed ?? []).length) return { skipped: true as const };
  } else {
    const { error: insErr } = await supabase
      .from('system_einstellungen')
      .insert({ key: KADENZ_LAUF_KEY, wert: now.toISOString() });
    // 23505: ein paralleler Lauf hat gerade beansprucht
    if (insErr) return { skipped: true as const };
  }

  return { skipped: false as const, ...(await runCadence(supabase, now, { agencyIds })) };
}
