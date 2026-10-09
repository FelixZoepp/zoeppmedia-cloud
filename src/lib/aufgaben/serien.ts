/**
 * Wiederkehrende Aufgaben (aufgaben_serien): täglich, wöchentlich, monatlich.
 * Der Minuten-Tick plant einmal täglich (ab 5 Uhr Berlin) den Job 'aufgaben.serien';
 * der legt für jede fällige Serie die Aufgabe des Tages an (eindeutig je Serie + Tag) und rückt die Serie weiter.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { berlinTag } from '@/lib/zeit/berlin';

import { naechsterTermin, type SerieRegel } from './regeln';
export { ersterTermin, naechsterTermin, regelText, wochentagVon, RHYTHMUS_LABEL, WOCHENTAGE, type Rhythmus, type SerieRegel } from './regeln';

/** Tick: einmal täglich ab 5 Uhr planen */
export async function planeSerien(svc: SupabaseClient, jetzt: Date = new Date()): Promise<void> {
  const stunde = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hourCycle: 'h23' }).formatToParts(jetzt).find((x) => x.type === 'hour')?.value ?? 0);
  if (stunde < 5) return;
  const tag = berlinTag(jetzt);
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'aufgaben.serien',
    run_at: jetzt.toISOString(),
    payload: { tag },
    status: 'pending',
    dedupe_key: `aufgaben.serien:${tag}`,
  });
  if (error && error.code !== '23505') console.error('[aufgaben-serien] nicht geplant:', error.message);
}

interface SerieRow extends SerieRegel {
  id: string;
  board_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  priority: string;
  naechste_am: string;
  created_by: string | null;
}

/** Job aufgaben.serien: fällige Serien-Aufgaben anlegen, Serien weiterrücken */
export async function legeSerienAufgabenAn(svc: SupabaseClient, jetzt: Date = new Date(), nurSerie?: string): Promise<number> {
  const heute = berlinTag(jetzt);
  let q = svc.from('aufgaben_serien').select('*').eq('aktiv', true).lte('naechste_am', heute);
  if (nurSerie) q = q.eq('id', nurSerie);
  const { data } = await q;
  let angelegt = 0;
  for (const s of (data ?? []) as SerieRow[]) {
    // Verpasste Tage nicht nachholen: nur die Aufgabe für heute bzw. den letzten fälligen Termin
    let termin = s.naechste_am;
    while (naechsterTermin(s, termin) <= heute) termin = naechsterTermin(s, termin);
    const { error } = await svc.from('internal_tasks').insert({
      title: s.title,
      description: s.description,
      board_id: s.board_id,
      assigned_to: s.assigned_to,
      priority: s.priority,
      status: 'todo',
      due_date: termin,
      serie_id: s.id,
      quelle: 'serie',
      created_by: s.created_by,
    });
    if (!error) angelegt++;
    else if (error.code !== '23505') {
      console.error('[aufgaben-serien] Aufgabe nicht angelegt', s.id, error.message);
      continue;
    }
    await svc.from('aufgaben_serien').update({ letzte_am: termin, naechste_am: naechsterTermin(s, termin) }).eq('id', s.id);
  }
  return angelegt;
}
