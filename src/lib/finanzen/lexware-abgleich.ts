/**
 * Lexware-Abgleich für den Cash-Plan: Rechnungen (voucherlist) → finanz_rechnungen,
 * danach je Rechnung Netto-Betrag (/invoices/{id}) und Zahlungsdatum (/payments/{id}).
 * Nur lesend – schreibt nichts nach Lexware, schickt nichts an Kunden.
 * Lexware erlaubt ~2 Anfragen/Sekunde → Detailabrufe gedrosselt und je Lauf begrenzt (holt Rückstand über mehrere Läufe auf).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { passtZu } from '@/lib/billing/rechnungsliste';

const BASE = 'https://api.lexoffice.io/v1';
const PAUSE_MS = 550;
export const LETZTER_ABGLEICH_KEY = 'finanz_lexware_abgleich';

interface VoucherZeile {
  id: string;
  voucherNumber?: string;
  voucherDate?: string;
  dueDate?: string | null;
  contactId?: string;
  contactName?: string;
  totalAmount?: number;
  openAmount?: number;
  voucherStatus?: string;
  updatedDate?: string;
}

export interface AbgleichErgebnis {
  rechnungen: number;
  details: number;
  rest: number;
  zugeordnet: number;
  abgebrochen?: string;
}

const warte = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function lex(path: string, key: string): Promise<{ status: number; data: unknown }> {
  const res = await fetch(`${BASE}${path}`, { headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' }, cache: 'no-store' });
  const data = res.headers.get('content-type')?.includes('json') ? await res.json().catch(() => null) : null;
  return { status: res.status, data };
}

/** Zahlungsdatum aus /payments: paidDate, sonst späteste Buchung */
export function zahlungsdatum(p: { paidDate?: string | null; paymentItems?: Array<{ postingDate?: string }> } | null): string | null {
  if (!p) return null;
  if (p.paidDate) return p.paidDate.slice(0, 10);
  const daten = (p.paymentItems ?? []).map((i) => i.postingDate?.slice(0, 10)).filter((d): d is string => !!d).sort();
  return daten.at(-1) ?? null;
}

/** Voucherlist-Zeile → Tabellenzeile (ohne Detailfelder) */
export function alsZeile(v: VoucherZeile) {
  return {
    voucher_id: v.id,
    nummer: v.voucherNumber ?? null,
    contact_id: v.contactId ?? null,
    kontakt: v.contactName ?? null,
    datum: v.voucherDate?.slice(0, 10) ?? null,
    faellig: v.dueDate?.slice(0, 10) ?? null,
    brutto: v.totalAmount ?? null,
    offen: v.openAmount ?? null,
    status: v.voucherStatus ?? null,
    lex_aktualisiert: v.updatedDate ?? null,
    updated_at: new Date().toISOString(),
  };
}

export async function gleicheLexwareAb(svc: SupabaseClient, opts: { maxDetails?: number; zeitbudgetMs?: number } = {}): Promise<AbgleichErgebnis> {
  const key = process.env.LEXOFFICE_API_KEY;
  if (!key) return { rechnungen: 0, details: 0, rest: 0, zugeordnet: 0, abgebrochen: 'LEXOFFICE_API_KEY fehlt' };
  const start = Date.now();
  const budget = opts.zeitbudgetMs ?? 40_000;
  const maxDetails = opts.maxDetails ?? 60;

  // 1. Alle Rechnungen (seitenweise)
  const { data: alt } = await svc.from('finanz_rechnungen').select('voucher_id, status, lex_aktualisiert, details_geladen');
  const bekannt = new Map((alt ?? []).map((r) => [r.voucher_id as string, r as { status: string | null; lex_aktualisiert: string | null; details_geladen: boolean }]));
  const zeilen: ReturnType<typeof alsZeile>[] = [];
  for (let page = 0; page < 20; page++) {
    const r = await lex(`/voucherlist?voucherType=invoice&voucherStatus=open,paid,paidoff,voided&size=250&page=${page}&sort=voucherDate,DESC`, key);
    if (r.status === 429) {
      await warte(1500);
      page--;
      continue;
    }
    if (r.status !== 200) return { rechnungen: zeilen.length, details: 0, rest: 0, zugeordnet: 0, abgebrochen: `Lexware ${r.status}` };
    const d = r.data as { content?: VoucherZeile[]; last?: boolean };
    for (const v of d.content ?? []) zeilen.push(alsZeile(v));
    if (d.last !== false) break;
    await warte(PAUSE_MS);
  }
  // Geänderte Rechnungen (Status/Bearbeitung) brauchen neue Details
  const neuLaden = zeilen.filter((z) => {
    const a = bekannt.get(z.voucher_id);
    return !a || a.status !== z.status || (a.lex_aktualisiert ?? '') !== (z.lex_aktualisiert ?? '');
  });
  for (let i = 0; i < zeilen.length; i += 200) {
    const teil = zeilen.slice(i, i + 200).map((z) => (neuLaden.includes(z) ? { ...z, details_geladen: false } : z));
    const { error } = await svc.from('finanz_rechnungen').upsert(teil, { onConflict: 'voucher_id' });
    if (error) return { rechnungen: zeilen.length, details: 0, rest: 0, zugeordnet: 0, abgebrochen: error.message };
  }

  // 2. Details (netto + Zahlungsdatum) für offene Einträge – neueste zuerst
  const { data: offen } = await svc
    .from('finanz_rechnungen')
    .select('voucher_id, status')
    .eq('details_geladen', false)
    .neq('status', 'voided')
    .order('datum', { ascending: false })
    .limit(500);
  let details = 0;
  let abgebrochen: string | undefined;
  for (const r of offen ?? []) {
    if (details >= maxDetails || Date.now() - start > budget) break;
    const inv = await lex(`/invoices/${r.voucher_id}`, key);
    if (inv.status === 429) {
      abgebrochen = 'Lexware-Limit erreicht – nächster Lauf macht weiter';
      break;
    }
    await warte(PAUSE_MS);
    const bezahlt = r.status === 'paid' || r.status === 'paidoff';
    const pay = bezahlt ? await lex(`/payments/${r.voucher_id}`, key) : null;
    if (pay?.status === 429) {
      abgebrochen = 'Lexware-Limit erreicht – nächster Lauf macht weiter';
      break;
    }
    if (bezahlt) await warte(PAUSE_MS);
    const netto = (inv.data as { totalPrice?: { totalNetAmount?: number } } | null)?.totalPrice?.totalNetAmount ?? null;
    await svc
      .from('finanz_rechnungen')
      .update({
        netto,
        bezahlt_am: bezahlt ? zahlungsdatum(pay?.data as Parameters<typeof zahlungsdatum>[0]) : null,
        details_geladen: inv.status === 200,
        updated_at: new Date().toISOString(),
      })
      .eq('voucher_id', r.voucher_id);
    details++;
  }

  // 3. Verträge ohne Lexware-Kontakt automatisch zuordnen (nur eindeutige Treffer)
  const zugeordnet = await ordneKontakteZu(svc);

  const { count } = await svc.from('finanz_rechnungen').select('voucher_id', { count: 'exact', head: true }).eq('details_geladen', false).neq('status', 'voided');
  await svc
    .from('system_einstellungen')
    .upsert({ key: LETZTER_ABGLEICH_KEY, wert: JSON.stringify({ am: new Date().toISOString(), rechnungen: zeilen.length, rest: count ?? 0 }) }, { onConflict: 'key' });
  return { rechnungen: zeilen.length, details, rest: count ?? 0, zugeordnet, abgebrochen };
}

/** Kontaktnamen aus Lexware den Verträgen zuordnen – nur wenn genau ein Kontakt passt */
export function findeKontakt(kunde: string, kontakte: Array<{ id: string; name: string }>): string | null {
  const treffer = kontakte.filter((k) => passtZu(kunde, k.name));
  return treffer.length === 1 ? treffer[0].id : null;
}

async function ordneKontakteZu(svc: SupabaseClient): Promise<number> {
  const [{ data: vertraege }, { data: rechnungen }] = await Promise.all([
    svc.from('finanz_vertraege').select('id, kunde').is('lex_contact_id', null),
    svc.from('finanz_rechnungen').select('contact_id, kontakt').not('contact_id', 'is', null),
  ]);
  const kontakte = [...new Map((rechnungen ?? []).map((r) => [r.contact_id as string, { id: r.contact_id as string, name: (r.kontakt as string) ?? '' }])).values()];
  let n = 0;
  for (const v of vertraege ?? []) {
    const id = findeKontakt(v.kunde as string, kontakte);
    if (!id) continue;
    await svc.from('finanz_vertraege').update({ lex_contact_id: id }).eq('id', v.id);
    n++;
  }
  return n;
}
