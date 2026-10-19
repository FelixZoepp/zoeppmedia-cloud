/**
 * Terminierung „Bucht sich selbst ein“: Der Lead sagt im Call, er bucht das Erstgespräch selbst.
 * - Lead bis zur Frist gesperrt (Kalender im Protokoll, sonst 2 Werktage, 10 Uhr) → niemand ruft dazwischen an
 * - zur Frist: Gibt es seit der Zusage einen Setting-Deal (= Calendly-Buchung)? Dann „gebucht“.
 *   Sonst Close-Aufgabe „anrufen und Termin direkt legen“; nach Ablauf der Sperre steht er wieder in den Listen.
 * - Auswertung „zugesagt vs. wirklich gebucht“ im Vertriebs-Controlling (Tabelle sales_selbstbucher).
 * Keine Nachricht an den Lead.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from './calendly-chain';
import { D2D_PIPELINE_ID } from './pipelines';

export const SELBSTBUCHER_ERGEBNIS = 'Bucht sich selbst ein';
const CLOSE_BASE = 'https://api.close.com/api/v1';

/** Frist: Kalender (wenn in der Zukunft), sonst 2 Werktage später um 10 Uhr Berlin (rein, testbar) */
export function selbstbucherFrist(kalender: string | null, jetzt: Date): string {
  if (kalender && new Date(kalender).getTime() > jetzt.getTime()) return new Date(kalender).toISOString();
  const d = new Date(Date.UTC(jetzt.getUTCFullYear(), jetzt.getUTCMonth(), jetzt.getUTCDate(), 8));
  let werktage = 0;
  while (werktage < 2) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) werktage++;
  }
  return d.toISOString();
}

export async function planeSelbstbucherCheck(svc: SupabaseClient, e: { leadId: string; protokollId: string; frist: string; jetzt: Date }): Promise<void> {
  const { error } = await svc.from('sales_selbstbucher').insert({ protokoll_id: e.protokollId, lead_id: e.leadId, zugesagt_am: e.jetzt.toISOString(), frist: e.frist });
  if (error?.code === '23505') return;
  if (error) throw new Error(error.message);
  await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.selbstbucher',
    run_at: e.frist,
    payload: { protokoll_id: e.protokollId },
    status: 'pending',
    dedupe_key: `sales.selbstbucher:${e.protokollId}`,
  });
}

function closeHeaders(): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${process.env.CLOSE_API_KEY ?? ''}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

/** Job sales.selbstbucher (zur Frist) */
export async function pruefeSelbstbucher(svc: SupabaseClient, payload: { protokoll_id: string }, jetzt: Date = new Date()): Promise<string> {
  const { data } = await svc.from('sales_selbstbucher').select('*').eq('protokoll_id', payload.protokoll_id).maybeSingle();
  const s = data as { lead_id: string; zugesagt_am: string; ergebnis: string } | null;
  if (!s || s.ergebnis !== 'offen') return 'erledigt';

  const res = await fetch(`${CLOSE_BASE}/opportunity/?lead_id=${s.lead_id}&pipeline_id=${D2D_PIPELINE_ID}&_fields=id,date_created`, { headers: closeHeaders(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Close ${res.status}`);
  const opps = ((await res.json()) as { data: Array<{ date_created: string }> }).data;
  // Kleine Toleranz: Deal im selben Moment wie das Protokoll angelegt (Buchung noch während des Calls)
  const gebucht = opps.some((o) => new Date(o.date_created).getTime() >= new Date(s.zugesagt_am).getTime() - 10 * 60_000);

  if (!gebucht) {
    const lead = await fetch(`${CLOSE_BASE}/lead/${s.lead_id}/?_fields=display_name`, { headers: closeHeaders(), cache: 'no-store' }).then((r) => (r.ok ? (r.json() as Promise<{ display_name?: string }>) : {}));
    const name = (lead as { display_name?: string }).display_name ?? 'Lead';
    await fetch(`${CLOSE_BASE}/task/`, {
      method: 'POST',
      headers: closeHeaders(),
      body: JSON.stringify({ lead_id: s.lead_id, text: `📅 ${name} wollte sich selbst einbuchen, hat aber nicht gebucht – anrufen und Termin direkt im Call legen`, date: jetzt.toISOString().slice(0, 10) }),
    });
  }
  await svc.from('sales_selbstbucher').update({ ergebnis: gebucht ? 'gebucht' : 'nicht_gebucht', geprueft_am: jetzt.toISOString() }).eq('protokoll_id', payload.protokoll_id);
  return gebucht ? 'gebucht' : 'nicht_gebucht';
}

/** Kennzahl fürs Controlling: Zusagen im Zeitraum */
export async function ladeSelbstbucher(svc: SupabaseClient, von: string, bis: string): Promise<{ zugesagt: number; gebucht: number; nichtGebucht: number; offen: number; quote: number | null }> {
  const { data } = await svc.from('sales_selbstbucher').select('ergebnis').gte('zugesagt_am', von).lt('zugesagt_am', bis);
  const l = (data ?? []) as Array<{ ergebnis: string }>;
  const gebucht = l.filter((x) => x.ergebnis === 'gebucht').length;
  const nichtGebucht = l.filter((x) => x.ergebnis === 'nicht_gebucht').length;
  return { zugesagt: l.length, gebucht, nichtGebucht, offen: l.length - gebucht - nichtGebucht, quote: gebucht + nichtGebucht ? Math.round((gebucht / (gebucht + nichtGebucht)) * 100) : null };
}
