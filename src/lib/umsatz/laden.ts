/**
 * Daten für die Umsatz-Analyse: Lexware-Rechnungen (Liste + Details), Kunden der Cloud, Close-Abschlüsse.
 * Lexware ist langsam und limitiert (ca. 2 Anfragen/s) → Liste 10 Min. gecacht, festgeschriebene Rechnungen 1 Tag.
 */

import { unstable_cache } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';
import type { Abschluss, Fakturiert, Kunde, Rechnung, Rechnungsstatus } from './berechnung';

const LEX_BASE = 'https://api.lexoffice.io/v1';
/** Höchstens so viele Rechnungsdetails pro Aufruf nachladen – der Rest wird geschätzt (brutto / 1,19) */
const MAX_DETAILS = 80;

interface LexVoucher {
  id: string;
  voucherNumber?: string | null;
  voucherDate: string;
  voucherStatus: string;
  totalAmount: number;
  contactId?: string | null;
  contactName?: string | null;
}

async function lexGet<T>(path: string): Promise<T> {
  const key = process.env.LEXOFFICE_API_KEY;
  if (!key) throw new Error('LEXOFFICE_API_KEY fehlt');
  const res = await fetch(`${LEX_BASE}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`Lexware ${res.status} bei ${path.split('?')[0]}`);
  return res.json() as Promise<T>;
}

async function ladeVoucherListe(): Promise<LexVoucher[]> {
  const out: LexVoucher[] = [];
  for (let page = 0; page < 20; page++) {
    const r = await lexGet<{ content: LexVoucher[]; last?: boolean; totalPages?: number }>(
      `/voucherlist?voucherType=invoice&voucherStatus=open,paid,paidoff&size=250&page=${page}&sort=voucherDate,DESC`,
    );
    out.push(...(r.content ?? []));
    if (r.last !== false || (r.totalPages != null && page + 1 >= r.totalPages)) break;
  }
  return out;
}

const voucherListeGecacht = unstable_cache(ladeVoucherListe, ['umsatz-lex-voucherlist'], { revalidate: 600 });

interface LexInvoiceDetail {
  totalPrice?: { totalNetAmount?: number };
  lineItems?: Array<{ name?: string; description?: string }>;
}

async function ladeDetail(id: string): Promise<{ netto: number | null; positionen: string[] }> {
  const d = await lexGet<LexInvoiceDetail>(`/invoices/${id}`);
  return {
    netto: typeof d.totalPrice?.totalNetAmount === 'number' ? d.totalPrice.totalNetAmount : null,
    positionen: (d.lineItems ?? []).map((l) => [l.name, l.description].filter(Boolean).join(' – ')).filter(Boolean),
  };
}

const detailGecacht = (id: string) => unstable_cache(() => ladeDetail(id), ['umsatz-lex-invoice', id], { revalidate: 86_400 })();

/** Rechnungen mit Netto und Positionen; Details nur für die jüngsten MAX_DETAILS, 2 parallel */
export async function ladeRechnungen(): Promise<Rechnung[]> {
  const liste = await voucherListeGecacht();
  const rechnungen: Rechnung[] = liste.map((v) => ({
    id: v.id,
    nummer: v.voucherNumber ?? null,
    datum: v.voucherDate.slice(0, 10),
    status: (['open', 'paid', 'paidoff'].includes(v.voucherStatus) ? v.voucherStatus : 'open') as Rechnungsstatus,
    brutto: v.totalAmount,
    netto: null,
    contactId: v.contactId ?? null,
    contactName: v.contactName ?? 'Unbekannt',
    positionen: [],
  }));
  const fuerDetails = [...rechnungen].sort((a, b) => b.datum.localeCompare(a.datum)).slice(0, MAX_DETAILS);
  for (let i = 0; i < fuerDetails.length; i += 2) {
    await Promise.all(
      fuerDetails.slice(i, i + 2).map(async (r) => {
        try {
          const d = await detailGecacht(r.id);
          r.netto = d.netto;
          r.positionen = d.positionen;
        } catch {
          /* Details optional – Schätzung bleibt */
        }
      }),
    );
  }
  return rechnungen;
}

export async function ladeKunden(svc: SupabaseClient): Promise<{ kunden: Kunde[]; fakturiert: Fakturiert[] }> {
  const [{ data: ags }, { data: due }] = await Promise.all([
    svc
      .from('agencies')
      .select('id, name, lex_contact_id, vertragsstart, mrr, setup_betrag, paket, fulfillment_phase, laufzeit_monate')
      .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`),
    svc.from('invoice_due').select('rechnungsnummer, typ, agency_id').not('rechnungsnummer', 'is', null),
  ]);
  const kunden = ((ags ?? []) as Kunde[]).map((k) => ({
    ...k,
    mrr: k.mrr != null ? Number(k.mrr) : null,
    setup_betrag: k.setup_betrag != null ? Number(k.setup_betrag) : null,
    laufzeit_monate: k.laufzeit_monate != null ? Number(k.laufzeit_monate) : null,
  }));
  return { kunden, fakturiert: (due ?? []) as Fakturiert[] };
}

async function ladeAbschluesseRoh(): Promise<Abschluss[]> {
  const { ladeClose } = await import('@/lib/sales-controlling/quellen');
  // Statuswechsel werden hier nicht gebraucht → Historie ab heute
  const heute = new Date().toISOString().slice(0, 10);
  const close = await ladeClose(heute, (opps) => opps.filter((o) => !!o.date_won));
  return close.opps
    .filter((o) => !!o.date_won)
    .map((o) => ({ lead_id: o.lead_id, lead_name: o.lead_name ?? null, wert: o.value, datum: o.date_won!, quelle: close.leadQuellen.get(o.lead_id) ?? null }));
}

const abschluesseGecacht = unstable_cache(ladeAbschluesseRoh, ['umsatz-close-won'], { revalidate: 600 });

export async function ladeAbschluesse(): Promise<Abschluss[] | null> {
  if (!process.env.CLOSE_API_KEY) return null;
  try {
    return await abschluesseGecacht();
  } catch (err) {
    console.error('[umsatz] Close', err);
    return null;
  }
}
