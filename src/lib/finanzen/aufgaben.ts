/**
 * Finanz-Aufgaben in der Cloud (intern, keine Nachricht an Kunden):
 *  - Board „Buchhaltung (Petra)“: Zahlung nachfragen bei überfälligen Rechnungen (2026+, > 3 Tage über Fälligkeit),
 *    bei noch nicht gestarteten Kunden zusätzlich „Start klären“
 *  - Board „Felix“: Verlängerung ansprechen, wenn eine Vertragslaufzeit in den nächsten 60 Tagen endet
 * Je Rechnung bzw. Vertragsende genau eine Aufgabe (quelle_ref eindeutig), einmal täglich vom Tick angestoßen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { laufzeitEnde, type FinanzVertrag } from './cashplan';
import type { FinanzRechnung } from './zahlungen';

export const BUCHHALTUNG_BOARD = 'Buchhaltung (Petra)';
export const FELIX_BOARD = 'Felix';
const TAG_KEY = 'finanz_aufgaben_tag';
const FELIX_ID = '0f578dce-1412-4f5f-9168-ad664f319e6f';

export interface FinanzAufgabe {
  board: typeof BUCHHALTUNG_BOARD | typeof FELIX_BOARD;
  title: string;
  description: string;
  due_date: string;
  priority: 'high' | 'medium';
  quelle_ref: string;
}

const euro = (v: number) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(v);
const datum = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString('de-DE');
const plusTage = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const MONATE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/** Welche Aufgaben sollten heute existieren? (rein, testbar) */
export function planeFinanzAufgaben(rechnungen: FinanzRechnung[], vertraege: Array<FinanzVertrag & { lex_contact_id?: string | null }>, heute: string): FinanzAufgabe[] {
  const out: FinanzAufgabe[] = [];
  const nichtGestartet = new Map<string, string>();
  for (const v of vertraege) {
    if (v.status !== 'startet') continue;
    for (const id of (v.lex_contact_id ?? '').split(',').map((x) => x.trim()).filter(Boolean)) nichtGestartet.set(id, v.kunde);
  }
  for (const r of rechnungen) {
    const offen = r.status === 'overdue' || (r.status === 'open' && !!r.faellig && r.faellig < plusTage(heute, -3));
    if (!offen || !r.datum || r.datum < '2026-01-01') continue;
    const betrag = r.offen ?? r.brutto ?? 0;
    if (betrag <= 0) continue;
    const start = r.contact_id ? nichtGestartet.get(r.contact_id) : undefined;
    out.push({
      board: BUCHHALTUNG_BOARD,
      title: `${start ? 'Start + Zahlung klären' : 'Zahlung nachfragen'}: ${r.kontakt ?? 'Kunde'} – ${r.nummer ?? ''} (${euro(betrag)})`,
      description: [
        `Rechnung ${r.nummer ?? '–'} vom ${datum(r.datum)}, fällig ${r.faellig ? datum(r.faellig) : '–'}, offen ${euro(betrag)} brutto.`,
        start ? `${start} ist noch nicht gestartet – beim Anruf Start-Termin und Zugänge klären, Setup muss vor Start bezahlt sein.` : 'Anrufen und Zahlungstermin vereinbaren; Ergebnis hier als Kommentar notieren.',
        'Ist das Geld eingegangen, in Lexware als bezahlt buchen – dann verschwindet die Rechnung aus der Liste.',
      ].join('\n'),
      due_date: heute,
      priority: start || (r.faellig && r.faellig < plusTage(heute, -14)) ? 'high' : 'medium',
      quelle_ref: `finanz:zahlung:${r.voucher_id}`,
    });
  }
  const grenze = plusTage(heute, 60);
  for (const v of vertraege) {
    if (v.status === 'beendet' || v.status === 'streitfall' || !v.monatlich) continue;
    const ende = laufzeitEnde(v);
    if (!ende) continue;
    const letzterTag = `${ende}-28`;
    if (letzterTag < heute || `${ende}-01` > grenze) continue;
    out.push({
      board: FELIX_BOARD,
      title: `Verlängerung ansprechen: ${v.kunde} (Laufzeit bis ${MONATE[Number(ende.slice(5, 7)) - 1]} ${ende.slice(0, 4)})`,
      description: [
        `Vertrag ${v.kunde}: ${euro(v.monatlich)} netto im Monat, Laufzeit endet ${MONATE[Number(ende.slice(5, 7)) - 1]} ${ende.slice(0, 4)}.`,
        'Ergebnis-Termin legen, Verlängerung bzw. Jahrespaket anbieten. Wird verlängert: im Cash-Plan Laufzeit/Verlängerung eintragen.',
      ].join('\n'),
      due_date: heute,
      priority: 'high',
      quelle_ref: `finanz:verlaengerung:${v.id}:${ende}`,
    });
  }
  return out;
}

/** Einmal täglich: fehlende Aufgaben anlegen (bestehende bleiben, wie sie sind) */
export async function legeFinanzAufgabenAn(svc: SupabaseClient, jetzt: Date = new Date()): Promise<number> {
  const heute = jetzt.toISOString().slice(0, 10);
  const { data: tag } = await svc.from('system_einstellungen').select('wert').eq('key', TAG_KEY).maybeSingle();
  if ((tag as { wert: string } | null)?.wert === heute) return 0;

  const [{ data: rechnungen }, { data: vertraege }, { data: boards }] = await Promise.all([
    svc.from('finanz_rechnungen').select('voucher_id, nummer, contact_id, kontakt, datum, faellig, brutto, netto, offen, status, bezahlt_am').in('status', ['open', 'overdue']).gte('datum', '2026-01-01'),
    svc.from('finanz_vertraege').select('*'),
    svc.from('aufgaben_boards').select('id, name').in('name', [BUCHHALTUNG_BOARD, FELIX_BOARD]).eq('archiviert', false),
  ]);
  const boardId = new Map((boards ?? []).map((b) => [b.name as string, b.id as string]));
  const zahl = (x: unknown) => (x == null ? null : Number(x));
  const plan = planeFinanzAufgaben(
    (rechnungen ?? []).map((r) => ({ ...(r as FinanzRechnung), brutto: zahl(r.brutto), netto: zahl(r.netto), offen: zahl(r.offen) })),
    (vertraege ?? []).map((v) => ({ ...(v as FinanzVertrag), monatlich: Number(v.monatlich), setup: Number(v.setup), ust_satz: Number(v.ust_satz) })),
    heute,
  );
  const { data: vorhanden } = plan.length
    ? await svc.from('internal_tasks').select('quelle_ref').in('quelle_ref', plan.map((p) => p.quelle_ref))
    : { data: [] as Array<{ quelle_ref: string }> };
  const schon = new Set((vorhanden ?? []).map((x) => x.quelle_ref as string));
  let angelegt = 0;
  for (const a of plan) {
    if (schon.has(a.quelle_ref)) continue;
    const { error } = await svc.from('internal_tasks').insert({
      title: a.title,
      description: a.description,
      board_id: boardId.get(a.board) ?? null,
      assigned_to: a.board === FELIX_BOARD ? FELIX_ID : null,
      priority: a.priority,
      status: 'todo',
      due_date: a.due_date,
      quelle: 'finanzen',
      quelle_ref: a.quelle_ref,
      created_by: FELIX_ID,
    });
    if (!error) angelegt++;
    else if (error.code !== '23505') console.error('[finanz-aufgaben]', a.quelle_ref, error.message);
  }
  await svc.from('system_einstellungen').upsert({ key: TAG_KEY, wert: heute }, { onConflict: 'key' });
  return angelegt;
}
