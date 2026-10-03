/**
 * Mahnwesen nach dem Zoepp System (7 Schritte), Daten aus Lexoffice.
 *
 * Hauptschalter: MAHNWESEN_AKTIV=true. Solange aus: nur Vorschau, keine Mails, keine Aufgaben.
 * MAHNWESEN_AB=YYYY-MM-DD: nur Rechnungen ab diesem Rechnungsdatum (Altfälle bleiben draußen).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { MAHN_SCHRITTE, type MahnSchritt } from './mahnwesen-vorlagen';

export function mahnwesenAktiv(): boolean {
  return process.env.MAHNWESEN_AKTIV === 'true';
}

export function mahnwesenAb(): string {
  return process.env.MAHNWESEN_AB || '2099-01-01';
}

export interface MahnFall {
  id: string;
  agency_id: string | null;
  lex_invoice_id: string;
  rechnungsnummer: string | null;
  kontakt_name: string | null;
  betrag_offen: number | null;
  rechnungsdatum: string;
  zahlungsziel: string;
  typ: 'setup' | 'retainer';
  schritt: number;
  status: 'offen' | 'bezahlt' | 'anwalt' | 'storniert' | 'ignoriert';
  zugesagt_bis: string | null;
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Fälligkeitsdatum eines Schritts für einen Fall. */
export function schrittDatum(fall: Pick<MahnFall, 'rechnungsdatum' | 'zahlungsziel'>, s: MahnSchritt): string {
  return addDays(s.basis === 'rechnung' ? fall.rechnungsdatum : fall.zahlungsziel, s.tage);
}

/**
 * Welcher Schritt ist heute dran? Der höchste fällige Schritt nach dem zuletzt erledigten.
 * Kuschel-Call nur bei Einrichtungsgebühr. Zahlungszusage bis X → bis dahin Ruhe.
 */
export function faelligerSchritt(fall: MahnFall, today: string): MahnSchritt | null {
  if (fall.status !== 'offen') return null;
  if (fall.zugesagt_bis && fall.zugesagt_bis >= today) return null;
  const kandidaten = MAHN_SCHRITTE.filter(
    (s) => s.schritt > fall.schritt && (!s.nurSetup || fall.typ === 'setup') && schrittDatum(fall, s) <= today,
  );
  return kandidaten.length ? kandidaten[kandidaten.length - 1] : null;
}

/** Nächster anstehender Schritt (für die Vorschau: "am 14.10. Mahnung 1"). */
export function naechsterSchritt(fall: MahnFall): { schritt: MahnSchritt; datum: string } | null {
  const s = MAHN_SCHRITTE.find((x) => x.schritt > fall.schritt && (!x.nurSetup || fall.typ === 'setup'));
  return s ? { schritt: s, datum: schrittDatum(fall, s) } : null;
}

// ---------------------------------------------------------------------------
// Lexoffice-Abgleich
// ---------------------------------------------------------------------------

export interface LexVoucher {
  id: string;
  voucherNumber: string;
  voucherDate: string;
  dueDate: string | null;
  voucherStatus: string;
  contactId?: string | null;
  contactName: string;
  totalAmount: number;
  openAmount: number;
}

async function lexVoucherList(status: string): Promise<LexVoucher[]> {
  const key = process.env.LEXOFFICE_API_KEY;
  if (!key) throw new Error('LEXOFFICE_API_KEY fehlt');
  const all: LexVoucher[] = [];
  for (let page = 0; page < 10; page++) {
    const res = await fetch(
      `https://api.lexoffice.io/v1/voucherlist?voucherType=invoice&voucherStatus=${status}&size=250&page=${page}&sort=voucherDate,DESC`,
      { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
    );
    if (!res.ok) throw new Error(`Lexoffice ${res.status}`);
    const data = (await res.json()) as { content: LexVoucher[]; last: boolean };
    all.push(...data.content);
    if (data.last) break;
    await new Promise((r) => setTimeout(r, 600)); // Lexoffice: max. 2 Anfragen/Sekunde
  }
  return all;
}

/** Offene Rechnungen ab Stichtag aus Lexoffice lesen und als Mahnfälle führen; bezahlte schließen. */
export async function syncMahnfaelle(svc: SupabaseClient, ab: string = mahnwesenAb()): Promise<{ neu: number; bezahlt: number }> {
  const offen = (await lexVoucherList('open')).filter((v) => v.voucherDate.slice(0, 10) >= ab);

  const { data: agencies } = await svc.from('agencies').select('id, lex_contact_id').not('lex_contact_id', 'is', null);
  const byContact = new Map(((agencies ?? []) as Array<{ id: string; lex_contact_id: string }>).map((a) => [a.lex_contact_id, a.id]));
  const { data: setupRows } = await svc.from('invoice_due').select('rechnungsnummer').eq('typ', 'setup').not('rechnungsnummer', 'is', null);
  const setupNummern = new Set(((setupRows ?? []) as Array<{ rechnungsnummer: string }>).map((r) => r.rechnungsnummer));

  const { data: existing } = await svc.from('dunning_cases').select('lex_invoice_id, status');
  const known = new Map(((existing ?? []) as Array<{ lex_invoice_id: string; status: string }>).map((c) => [c.lex_invoice_id, c.status]));

  let neu = 0;
  for (const v of offen) {
    if (known.has(v.id)) continue;
    await svc.from('dunning_cases').insert({
      lex_invoice_id: v.id,
      agency_id: (v.contactId && byContact.get(v.contactId)) || null,
      rechnungsnummer: v.voucherNumber,
      kontakt_name: v.contactName,
      betrag_offen: v.openAmount,
      rechnungsdatum: v.voucherDate.slice(0, 10),
      zahlungsziel: (v.dueDate ?? v.voucherDate).slice(0, 10),
      typ: setupNummern.has(v.voucherNumber) ? 'setup' : 'retainer',
      schritt: 1,
    });
    neu++;
  }

  // Nicht mehr offen in Lexoffice → bezahlt
  const offenIds = new Set(offen.map((v) => v.id));
  const zuSchliessen = [...known.entries()].filter(([id, status]) => status === 'offen' && !offenIds.has(id)).map(([id]) => id);
  if (zuSchliessen.length) {
    await svc
      .from('dunning_cases')
      .update({ status: 'bezahlt', bezahlt_am: new Date().toISOString(), updated_at: new Date().toISOString() })
      .in('lex_invoice_id', zuSchliessen);
  }
  return { neu, bezahlt: zuSchliessen.length };
}

/** Aktion zu einem Schritt festhalten (Anruf erreicht / nicht erreicht / an Anwalt abgegeben). */
export async function aktionErfassen(
  svc: SupabaseClient,
  caseId: string,
  schritt: number,
  ergebnis: 'erreicht' | 'nicht_erreicht' | 'gesendet' | 'abgegeben',
  opts: { userId?: string | null; notiz?: string | null; zugesagt_bis?: string | null } = {},
): Promise<void> {
  const { data } = await svc.from('dunning_cases').select('*').eq('id', caseId).maybeSingle();
  const fall = data as MahnFall | null;
  if (!fall) throw new Error('Fall nicht gefunden');

  await svc.from('dunning_actions').insert({
    case_id: caseId,
    schritt,
    ergebnis,
    notiz: opts.notiz ?? null,
    zugesagt_bis: opts.zugesagt_bis ?? null,
    user_id: opts.userId ?? null,
  });

  const patch: Record<string, unknown> = {
    schritt: Math.max(fall.schritt, schritt),
    updated_at: new Date().toISOString(),
  };
  if (opts.zugesagt_bis) patch.zugesagt_bis = opts.zugesagt_bis;
  if (schritt === 7 && ergebnis === 'abgegeben') {
    patch.status = 'anwalt';
    if (fall.agency_id) {
      await svc
        .from('agencies')
        .update({ pausiert_grund: `Zurückbehaltungsrecht – Rechnung ${fall.rechnungsnummer ?? ''} beim Anwalt` })
        .eq('id', fall.agency_id);
    }
  }
  await svc.from('dunning_cases').update(patch).eq('id', caseId);
}
