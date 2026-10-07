/**
 * Kunden im Sales-WhatsApp: Handynummer ermitteln (Cloud → Kunden-Login → Close) und den
 * WhatsApp-Kontakt als Kunden markieren (Inbox-Tab „Kunden“, Erinnerungen per Bot).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { ensureSalesProspect, normalizeToE164, SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { HIDDEN_AGENCY_IDS } from './views';

interface KundeRoh {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contact_name: string | null;
}

const letzte9 = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').slice(-9);

/** Handynummer eines Kunden: agencies.phone, sonst Kunden-Login, sonst Close (wird in agencies.phone gespeichert) */
export async function kundenNummer(svc: SupabaseClient, k: KundeRoh, mitClose = true): Promise<string | null> {
  const direkt = normalizeToE164(k.phone);
  if (direkt) return direkt;
  const { data: us } = await svc.from('users').select('phone, email').eq('agency_id', k.id).eq('role', 'agency_owner');
  const owner = ((us ?? []) as Array<{ phone: string | null; email: string | null }>).map((u) => normalizeToE164(u.phone)).find(Boolean);
  let nummer = owner ?? null;
  if (!nummer && mitClose) {
    const { findCloseLeadIdByEmail, findCloseLeadIdByName, ladeCloseLead } = await import('@/lib/sales/close');
    const mails = [k.email, ...((us ?? []) as Array<{ email: string | null }>).map((u) => u.email)].filter((x): x is string => !!x);
    let leadId: string | null = null;
    for (const m of mails) if (!leadId) leadId = await findCloseLeadIdByEmail(m).catch(() => null);
    if (!leadId && k.contact_name) leadId = await findCloseLeadIdByName(k.contact_name).catch(() => null);
    if (leadId) nummer = normalizeToE164((await ladeCloseLead(leadId).catch(() => null))?.phone);
  }
  if (nummer) await svc.from('agencies').update({ phone: nummer }).eq('id', k.id);
  return nummer;
}

/** WhatsApp-Kontakt (Sales-Agentur) für den Kunden sicherstellen und als Kunde markieren */
export async function kundenKontakt(svc: SupabaseClient, k: KundeRoh, nummer: string): Promise<string | null> {
  const id = await ensureSalesProspect(svc, nummer, k.contact_name || k.name, k.email);
  if (id) await svc.from('candidates').update({ kunde_agency_id: k.id }).eq('id', id).eq('agency_id', SALES_AGENCY_ID);
  return id;
}

/**
 * Alle aktiven Kunden: Nummer ermitteln und vorhandene Sales-WhatsApp-Kontakte (gleiche Nummer oder E-Mail)
 * als Kunden markieren. Legt keine neuen Kontakte an.
 */
export async function verknuepfeKundenKontakte(svc: SupabaseClient, opts: { mitClose?: boolean } = {}) {
  const { data: ags } = await svc
    .from('agencies')
    .select('id, name, email, phone, contact_name, fulfillment_phase')
    .not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`)
    .neq('fulfillment_phase', 'beendet');
  const kunden = (ags ?? []) as Array<KundeRoh & { fulfillment_phase: string | null }>;
  const { data: cands } = await svc.from('candidates').select('id, phone_e164, email, kunde_agency_id').eq('agency_id', SALES_AGENCY_ID).is('deleted_at', null);
  const kontakte = (cands ?? []) as Array<{ id: string; phone_e164: string | null; email: string | null; kunde_agency_id: string | null }>;
  const { data: owners } = await svc.from('users').select('agency_id, email').eq('role', 'agency_owner');
  const ownerMails = (owners ?? []) as Array<{ agency_id: string; email: string | null }>;

  const ergebnis: Array<{ id: string; name: string; nummer: string | null; verknuepft: number }> = [];
  for (const k of kunden) {
    const nummer = await kundenNummer(svc, k, opts.mitClose ?? false);
    const mails = new Set([k.email, ...ownerMails.filter((o) => o.agency_id === k.id).map((o) => o.email)].filter(Boolean).map((m) => m!.toLowerCase()));
    const treffer = kontakte.filter(
      (c) => c.kunde_agency_id !== k.id && ((nummer && letzte9(c.phone_e164) === letzte9(nummer)) || (c.email && mails.has(c.email.toLowerCase()))),
    );
    for (const c of treffer) await svc.from('candidates').update({ kunde_agency_id: k.id }).eq('id', c.id);
    ergebnis.push({ id: k.id, name: k.name, nummer, verknuepft: treffer.length });
  }
  return ergebnis;
}
