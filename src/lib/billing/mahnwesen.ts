/**
 * Mahnwesen nach dem Zoepp System (7 Schritte), Daten aus Lexoffice.
 *
 * Grundsatz: NICHTS geht automatisch raus. Die Cloud liest offene Rechnungen aus Lexoffice (nur lesen),
 * schlägt den fälligen Schritt als Aufgabe für die Buchhaltung vor, und die Buchhaltung prüft und
 * versendet jede Mail/WhatsApp selbst per Klick.
 *
 * Stichtag: system_einstellungen.mahnwesen = {"ab": "YYYY-MM-DD"} (in /buchhaltung einstellbar),
 * Fallback MAHNWESEN_AB. Nur Rechnungen ab diesem Rechnungsdatum werden zu Mahnfällen (Altfälle bleiben draußen).
 * Ohne Stichtag: keine Fälle, keine Aufgaben.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { MAHN_SCHRITTE, type MahnSchritt } from './mahnwesen-vorlagen';

const KEIN_STICHTAG = '2099-01-01';

/** Stichtag aus system_einstellungen (sonst Vercel-Variable, sonst keiner) */
export async function ladeStichtag(svc: SupabaseClient): Promise<string | null> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'mahnwesen').maybeSingle();
  try {
    const w = (data as { wert: unknown } | null)?.wert;
    const obj = (typeof w === 'string' ? JSON.parse(w) : w) as { ab?: string } | null;
    if (obj?.ab && /^\d{4}-\d{2}-\d{2}$/.test(obj.ab)) return obj.ab;
  } catch {
    /* Fallback */
  }
  const env = process.env.MAHNWESEN_AB;
  return env && env !== KEIN_STICHTAG ? env : null;
}

export async function setzeStichtag(svc: SupabaseClient, ab: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ab)) throw new Error('Ungültiges Datum');
  const { error } = await svc.from('system_einstellungen').upsert({ key: 'mahnwesen', wert: JSON.stringify({ ab }), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
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
  einschaetzung?: 'zahlt' | 'unsicher' | 'ausfall' | null;
  bezahlt_am?: string | null;
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
export async function syncMahnfaelle(svc: SupabaseClient, abParam?: string | null): Promise<{ neu: number; bezahlt: number; aktualisiert: number }> {
  const ab = abParam ?? (await ladeStichtag(svc));
  if (!ab) return { neu: 0, bezahlt: 0, aktualisiert: 0 };
  const offen = (await lexVoucherList('open')).filter((v) => v.voucherDate.slice(0, 10) >= ab);

  const { data: agencies } = await svc.from('agencies').select('id, lex_contact_id').not('lex_contact_id', 'is', null);
  const byContact = new Map(((agencies ?? []) as Array<{ id: string; lex_contact_id: string }>).map((a) => [a.lex_contact_id, a.id]));
  const { data: setupRows } = await svc.from('invoice_due').select('rechnungsnummer').eq('typ', 'setup').not('rechnungsnummer', 'is', null);
  const setupNummern = new Set(((setupRows ?? []) as Array<{ rechnungsnummer: string }>).map((r) => r.rechnungsnummer));

  const { data: existing } = await svc.from('dunning_cases').select('lex_invoice_id, status, betrag_offen');
  const rows = (existing ?? []) as Array<{ lex_invoice_id: string; status: string; betrag_offen: number | null }>;
  const known = new Map(rows.map((c) => [c.lex_invoice_id, c.status]));
  const betraege = new Map(rows.map((c) => [c.lex_invoice_id, c.betrag_offen === null ? null : Number(c.betrag_offen)]));

  let neu = 0;
  let aktualisiert = 0;
  for (const v of offen) {
    if (known.has(v.id)) {
      // Teilzahlung in Lexoffice → offenen Betrag nachziehen
      if (betraege.get(v.id) !== v.openAmount) {
        await svc.from('dunning_cases').update({ betrag_offen: v.openAmount, updated_at: new Date().toISOString() }).eq('lex_invoice_id', v.id);
        aktualisiert++;
      }
      continue;
    }
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
  if (zuSchliessen.length) await erledigeMahnAufgaben(svc, zuSchliessen, 'lex');
  return { neu, bezahlt: zuSchliessen.length, aktualisiert };
}

/** Aktion zu einem Schritt festhalten (Anruf erreicht / nicht erreicht / an Anwalt abgegeben). */
export async function aktionErfassen(
  svc: SupabaseClient,
  caseId: string,
  schritt: number,
  ergebnis: MahnErgebnis,
  opts: { userId?: string | null; notiz?: string | null; zugesagt_bis?: string | null; kanal?: MahnKanal | null; details?: Record<string, unknown> | null } = {},
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
    kanal: opts.kanal ?? null,
    details: opts.details ?? null,
  });

  const patch: Record<string, unknown> = {
    // Notizen/Krisengespräche/Entscheidungen (Schritt 0) schalten keine Mahnstufe weiter
    schritt: Math.max(fall.schritt, schritt || fall.schritt),
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
  // Schritt bearbeitet → vorgeschlagene Aufgabe abhaken
  if (schritt > 0 && ['erreicht', 'nicht_erreicht', 'gesendet', 'abgegeben'].includes(ergebnis)) {
    await svc.from('internal_tasks').update({ status: 'done', erledigt_am: new Date().toISOString() }).eq('quelle', 'mahnwesen').like('quelle_ref', `mahn:${caseId}:%`).neq('status', 'done');
  }
}

export type MahnErgebnis = 'erreicht' | 'nicht_erreicht' | 'gesendet' | 'abgegeben' | 'notiz' | 'krisengespraech' | 'eskalation' | 'entscheidung' | 'status';
export type MahnKanal = 'anruf' | 'mail' | 'whatsapp' | 'notiz' | 'krisengespraech' | 'eskalation' | 'entscheidung' | 'status';

/** Offene Vorschlags-Aufgaben eines Falls abhaken (bezahlt / Status geändert) */
export async function erledigeMahnAufgaben(svc: SupabaseClient, ids: string[], art: 'case' | 'lex' = 'case'): Promise<void> {
  let caseIds = ids;
  if (art === 'lex') {
    const { data } = await svc.from('dunning_cases').select('id').in('lex_invoice_id', ids);
    caseIds = ((data ?? []) as Array<{ id: string }>).map((x) => x.id);
  }
  for (const id of caseIds) {
    await svc.from('internal_tasks').update({ status: 'done', erledigt_am: new Date().toISOString() }).eq('quelle', 'mahnwesen').like('quelle_ref', `mahn:${id}:%`).neq('status', 'done');
  }
}

const euroText = (n: number | null) => (n === null ? '' : ` (${Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 })} €)`);

/**
 * Täglich: für jeden Fall mit fälligem Schritt EINE Aufgabe „Mahnung prüfen“ für die Buchhaltung
 * (Funktion backoffice, sonst Admins). Es wird nichts verschickt – die Aufgabe verlinkt auf den Vorschlag.
 */
export async function planeMahnAufgaben(svc: SupabaseClient, heute: string): Promise<{ angelegt: number }> {
  const { data: faelle } = await svc.from('dunning_cases').select('*').eq('status', 'offen');
  const liste = ((faelle ?? []) as MahnFall[]).map((f) => ({ f, s: faelligerSchritt(f, heute) })).filter((x) => x.s);
  if (!liste.length) return { angelegt: 0 };

  const { data: bo } = await svc.from('users').select('id').eq('funktion', 'backoffice');
  let zustaendig = ((bo ?? []) as Array<{ id: string }>).map((u) => u.id);
  if (!zustaendig.length) {
    const { data: admins } = await svc.from('users').select('id').eq('role', 'admin');
    zustaendig = ((admins ?? []) as Array<{ id: string }>).map((u) => u.id).slice(0, 1);
  }
  const an = zustaendig[0] ?? null;

  const { data: ag } = await svc.from('agencies').select('id, name').in('id', liste.map((x) => x.f.agency_id).filter((x): x is string => !!x));
  const namen = new Map(((ag ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name]));

  let angelegt = 0;
  for (const { f, s } of liste) {
    const ref = `mahn:${f.id}:${s!.schritt}`;
    const { data: da } = await svc.from('internal_tasks').select('id').eq('quelle', 'mahnwesen').eq('quelle_ref', ref).limit(1);
    if (da?.length) continue;
    const kunde = (f.agency_id && namen.get(f.agency_id)) || f.kontakt_name || 'Kunde';
    const { error } = await svc.from('internal_tasks').insert({
      title: `💶 ${s!.titel}: ${kunde}${euroText(f.betrag_offen)}`,
      description: `Rechnung ${f.rechnungsnummer ?? ''} – fällig seit ${new Date(`${f.zahlungsziel}T12:00:00Z`).toLocaleDateString('de-DE')}.\nVorschlag prüfen, anrufen und Mail/WhatsApp selbst versenden: /buchhaltung?fall=${f.id}`,
      agency_id: f.agency_id,
      assigned_to: an,
      status: 'todo',
      priority: s!.schritt >= 5 ? 'urgent' : s!.schritt >= 4 ? 'high' : 'medium',
      due_date: heute,
      quelle: 'mahnwesen',
      quelle_ref: ref,
    });
    if (!error) {
      angelegt++;
      // Ältere Vorschläge desselben Falls sind damit überholt
      await svc.from('internal_tasks').update({ status: 'done', erledigt_am: new Date().toISOString() }).eq('quelle', 'mahnwesen').like('quelle_ref', `mahn:${f.id}:%`).neq('quelle_ref', ref).neq('status', 'done');
    } else console.error('[mahnwesen] Aufgabe nicht angelegt:', error.message);
  }
  return { angelegt };
}

export interface MahnBericht {
  offen: { anzahl: number; summe: number };
  ueberfaellig: { anzahl: number; summe: number };
  nachSchritt: Array<{ schritt: number; titel: string; anzahl: number; summe: number }>;
  anwalt: { anzahl: number; summe: number };
  zugesagt: { anzahl: number; summe: number };
  einschaetzung: { zahlt: number; unsicher: number; ausfall: number };
  ausfallRisiko: number;
  bezahlt30: { anzahl: number; summe: number };
  schuldner: Array<{ kunde: string; summe: number; aeltesteTage: number; schritt: number; einschaetzung: string | null }>;
}

/** Zahlungsausfall-Bericht (rein, testbar) */
export function berechneMahnBericht(faelle: Array<MahnFall & { kunde?: string | null }>, heute: string): MahnBericht {
  const summe = (xs: MahnFall[]) => Math.round(xs.reduce((a, f) => a + Number(f.betrag_offen ?? 0), 0) * 100) / 100;
  const tage = (d: string) => Math.max(0, Math.round((new Date(`${heute}T12:00:00Z`).getTime() - new Date(`${d}T12:00:00Z`).getTime()) / 864e5));
  const offen = faelle.filter((f) => f.status === 'offen');
  const ueber = offen.filter((f) => f.zahlungsziel < heute);
  const anwalt = faelle.filter((f) => f.status === 'anwalt');
  const zugesagt = offen.filter((f) => f.zugesagt_bis && f.zugesagt_bis >= heute);
  const vor30 = new Date(new Date(`${heute}T12:00:00Z`).getTime() - 30 * 864e5).toISOString();
  const bezahlt = faelle.filter((f) => f.status === 'bezahlt' && f.bezahlt_am && f.bezahlt_am >= vor30);
  const risiko = [...offen.filter((f) => f.einschaetzung === 'ausfall' || f.schritt >= 6), ...anwalt];

  const proKunde = new Map<string, MahnFall[]>();
  for (const f of [...ueber, ...anwalt]) {
    const k = f.kunde || f.kontakt_name || 'Unbekannt';
    proKunde.set(k, [...(proKunde.get(k) ?? []), f]);
  }
  return {
    offen: { anzahl: offen.length, summe: summe(offen) },
    ueberfaellig: { anzahl: ueber.length, summe: summe(ueber) },
    nachSchritt: MAHN_SCHRITTE.map((s) => {
      const xs = ueber.filter((f) => f.schritt === s.schritt);
      return { schritt: s.schritt, titel: s.titel, anzahl: xs.length, summe: summe(xs) };
    }).filter((x) => x.anzahl),
    anwalt: { anzahl: anwalt.length, summe: summe(anwalt) },
    zugesagt: { anzahl: zugesagt.length, summe: summe(zugesagt) },
    einschaetzung: {
      zahlt: offen.filter((f) => f.einschaetzung === 'zahlt').length,
      unsicher: offen.filter((f) => f.einschaetzung === 'unsicher').length,
      ausfall: offen.filter((f) => f.einschaetzung === 'ausfall').length,
    },
    ausfallRisiko: summe([...new Set(risiko)]),
    bezahlt30: { anzahl: bezahlt.length, summe: summe(bezahlt) },
    schuldner: [...proKunde.entries()]
      .map(([kunde, xs]) => ({
        kunde,
        summe: summe(xs),
        aeltesteTage: Math.max(...xs.map((f) => tage(f.zahlungsziel))),
        schritt: Math.max(...xs.map((f) => f.schritt)),
        einschaetzung: xs.find((f) => f.einschaetzung)?.einschaetzung ?? null,
      }))
      .sort((a, b) => b.summe - a.summe)
      .slice(0, 15),
  };
}
