/**
 * Rechnungsliste für die Buchhaltung: Wer bekommt diesen Monat eine Rechnung?
 * Rechnungen schreibt Petra manuell in Lexoffice – die Cloud listet nur auf und hakt ab.
 *
 * Retainer: monatlich zum Vertragsstart-Tag (z.B. Start am 14. → jeden 14.).
 * Einrichtungsgebühr: einmalig, solange noch nicht geschrieben.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import { setStepStatus } from '@/lib/fulfillment/engine';

export interface Vertragsdaten {
  id: string;
  name: string;
  vertragsstart: string | null;
  mrr: number | null;
  setup_betrag: number | null;
  lex_contact_id: string | null;
  fulfillment_phase: string | null;
}

export interface Rechnungszeile {
  agency_id: string;
  name: string;
  typ: 'setup' | 'retainer';
  periode: string;
  faellig_am: string;
  betrag_netto: number | null;
  geschrieben_am: string | null;
  rechnungsnummer: string | null;
}

/** Fälligkeitstag im Monat: Tag des Vertragsstarts, im kurzen Monat der letzte Tag. */
export function faelligImMonat(vertragsstart: string, monat: string): string {
  const tag = Number(vertragsstart.slice(8, 10));
  const [y, m] = monat.split('-').map(Number);
  const letzter = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${monat}-${String(Math.min(tag, letzter)).padStart(2, '0')}`;
}

const INAKTIV = ['offboarding', 'beendet'];

export function rechnungenFuerMonat(
  agencies: Vertragsdaten[],
  geschrieben: Array<{ agency_id: string; typ: string; periode: string; geschrieben_am: string | null; rechnungsnummer: string | null }>,
  monat: string,
): Rechnungszeile[] {
  const key = (a: string, t: string, p: string) => `${a}|${t}|${p}`;
  const done = new Map(geschrieben.map((g) => [key(g.agency_id, g.typ, g.periode), g]));
  const zeilen: Rechnungszeile[] = [];

  for (const a of agencies) {
    if (INAKTIV.includes(a.fulfillment_phase ?? '')) continue;

    if (a.setup_betrag) {
      const g = done.get(key(a.id, 'setup', 'setup'));
      // Einrichtungsgebühr erscheint, bis sie geschrieben ist (bzw. im Monat, in dem sie geschrieben wurde)
      if (!g?.geschrieben_am || g.geschrieben_am.slice(0, 7) === monat) {
        zeilen.push({
          agency_id: a.id, name: a.name, typ: 'setup', periode: 'setup',
          faellig_am: a.vertragsstart ?? `${monat}-01`, betrag_netto: a.setup_betrag,
          geschrieben_am: g?.geschrieben_am ?? null, rechnungsnummer: g?.rechnungsnummer ?? null,
        });
      }
    }

    if (a.mrr && a.vertragsstart && a.vertragsstart.slice(0, 7) <= monat) {
      const g = done.get(key(a.id, 'retainer', monat));
      zeilen.push({
        agency_id: a.id, name: a.name, typ: 'retainer', periode: monat,
        faellig_am: faelligImMonat(a.vertragsstart, monat), betrag_netto: a.mrr,
        geschrieben_am: g?.geschrieben_am ?? null, rechnungsnummer: g?.rechnungsnummer ?? null,
      });
    }
  }
  return zeilen.sort((x, y) => x.faellig_am.localeCompare(y.faellig_am));
}

export async function loadVertragsdaten(svc: SupabaseClient): Promise<Vertragsdaten[]> {
  const { data } = await svc
    .from('agencies')
    .select('id, name, vertragsstart, mrr, setup_betrag, lex_contact_id, fulfillment_phase')
    .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`)
    .order('name');
  return ((data ?? []) as Vertragsdaten[]).map((a) => ({
    ...a,
    mrr: a.mrr != null ? Number(a.mrr) : null,
    setup_betrag: a.setup_betrag != null ? Number(a.setup_betrag) : null,
  }));
}

export async function loadRechnungsliste(svc: SupabaseClient, monat: string) {
  const agencies = await loadVertragsdaten(svc);
  const { data } = await svc.from('invoice_due').select('agency_id, typ, periode, geschrieben_am, rechnungsnummer');
  return {
    rechnungen: rechnungenFuerMonat(agencies, (data ?? []) as never, monat),
    fehlend: agencies.filter((a) => !INAKTIV.includes(a.fulfillment_phase ?? '') && (!a.vertragsstart || !a.mrr || !a.lex_contact_id)),
    vertragsdaten: agencies,
  };
}

/** Rechnung als geschrieben markieren. Einrichtungsgebühr → Fulfillment-Schritt "Rechnung geschrieben" erledigt. */
export async function markiereGeschrieben(
  svc: SupabaseClient,
  z: { agency_id: string; typ: 'setup' | 'retainer'; periode: string; faellig_am: string; betrag_netto: number | null },
  rechnungsnummer: string | null,
  userId: string,
): Promise<void> {
  await svc.from('invoice_due').upsert(
    {
      ...z,
      geschrieben_am: new Date().toISOString(),
      geschrieben_von: userId,
      rechnungsnummer: rechnungsnummer?.trim() || null,
    },
    { onConflict: 'agency_id,typ,periode' },
  );
  if (z.typ === 'setup') {
    const { data: step } = await svc
      .from('client_steps')
      .select('id, status')
      .eq('agency_id', z.agency_id)
      .eq('step_key', 'z_rechnung_setup')
      .maybeSingle();
    const s = step as { id: string; status: string } | null;
    if (s && s.status !== 'erledigt') await setStepStatus(svc, s.id, 'erledigt', { userId, kommentar: rechnungsnummer ? `Rechnung ${rechnungsnummer}` : null });
  }
}

// ---------------------------------------------------------------------------
// Vorschläge aus Lexoffice (Kontakt, letzter Betrag, Rechnungstag)
// ---------------------------------------------------------------------------

export interface LexVorschlag {
  contactId: string;
  contactName: string;
  letzteRechnung: string;
  ersteRechnung: string;
  letzterBetragBrutto: number;
  anzahl: number;
}

function norm(s: string): string {
  return s.toLowerCase().replace(/gmbh|ug|haftungsbeschränkt|\(|\)|&|\.|,/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Passt ein Lexoffice-Kontakt zum Kundennamen? (gemeinsames markantes Wort) */
export function passtZu(agencyName: string, contactName: string): boolean {
  const a = norm(agencyName).split(' ').filter((w) => w.length >= 4);
  const c = norm(contactName);
  return a.some((w) => c.includes(w));
}

export async function lexVorschlaege(): Promise<LexVorschlag[]> {
  const key = process.env.LEXOFFICE_API_KEY;
  if (!key) return [];
  const res = await fetch(
    'https://api.lexoffice.io/v1/voucherlist?voucherType=invoice&voucherStatus=open,paid,paidoff&size=250&sort=voucherDate,DESC',
    { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' } },
  );
  if (!res.ok) return [];
  const { content } = (await res.json()) as {
    content: Array<{ contactId?: string; contactName: string; voucherDate: string; totalAmount: number }>;
  };
  const byContact = new Map<string, LexVorschlag>();
  for (const v of content) {
    if (!v.contactId) continue;
    const datum = v.voucherDate.slice(0, 10);
    const cur = byContact.get(v.contactId);
    if (!cur) {
      byContact.set(v.contactId, {
        contactId: v.contactId, contactName: v.contactName, letzteRechnung: datum, ersteRechnung: datum,
        letzterBetragBrutto: v.totalAmount, anzahl: 1,
      });
    } else {
      cur.anzahl++;
      if (datum < cur.ersteRechnung) cur.ersteRechnung = datum;
    }
  }
  return [...byContact.values()];
}
