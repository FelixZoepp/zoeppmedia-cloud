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

/** Alle Kennungen aktiver Kunden: letzte 9 Ziffern bzw. E-Mail (klein) → Agentur-ID */
export interface KundenKennungen {
  nummern: Map<string, string>;
  mails: Map<string, string>;
}

type KundeMitPhase = KundeRoh & { fulfillment_phase: string | null };

async function ladeAktiveKunden(svc: SupabaseClient): Promise<KundeMitPhase[]> {
  const { data: ags } = await svc
    .from('agencies')
    .select('id, name, email, phone, contact_name, fulfillment_phase')
    .not('id', 'in', `(${[...HIDDEN_AGENCY_IDS, SALES_AGENCY_ID].join(',')})`)
    .neq('fulfillment_phase', 'beendet');
  return (ags ?? []) as KundeMitPhase[];
}

/**
 * Kennungen aus der Cloud: Agentur-Telefon/-Mail und ALLE Nutzer der Kunden-Agentur (nicht nur Inhaber).
 * Mehrdeutige Kennungen (zwei Kunden mit derselben Nummer/Mail) werden verworfen.
 */
export async function ladeKundenKennungen(svc: SupabaseClient, kunden?: KundeMitPhase[]): Promise<KundenKennungen> {
  const liste = kunden ?? (await ladeAktiveKunden(svc));
  const ids = new Set(liste.map((k) => k.id));
  const { data: us } = await svc.from('users').select('agency_id, phone, email').in('agency_id', [...ids]);
  const nummern = new Map<string, string>();
  const mails = new Map<string, string>();
  const doppelt = new Set<string>();
  const merke = (map: Map<string, string>, key: string, agencyId: string) => {
    if (!key) return;
    const vorhanden = map.get(key);
    if (vorhanden && vorhanden !== agencyId) doppelt.add(key);
    else map.set(key, agencyId);
  };
  for (const k of liste) {
    merke(nummern, letzte9(k.phone), k.id);
    if (k.email) merke(mails, k.email.toLowerCase(), k.id);
  }
  for (const u of (us ?? []) as Array<{ agency_id: string | null; phone: string | null; email: string | null }>) {
    if (!u.agency_id || !ids.has(u.agency_id)) continue;
    merke(nummern, letzte9(u.phone), u.agency_id);
    if (u.email) merke(mails, u.email.toLowerCase(), u.agency_id);
  }
  for (const key of doppelt) {
    nummern.delete(key);
    mails.delete(key);
  }
  return { nummern, mails };
}

/** Kennungen eines Kunden aus Close: alle Telefonnummern/Mails der Kontakte des Close-Leads */
async function closeKennungen(svc: SupabaseClient, k: KundeRoh): Promise<{ phones: string[]; emails: string[] }> {
  const { findCloseLeadIdByEmail, findCloseLeadIdByName, getCloseLeadContacts } = await import('@/lib/sales/close');
  const { data: us } = await svc.from('users').select('email').eq('agency_id', k.id);
  const mails = [k.email, ...((us ?? []) as Array<{ email: string | null }>).map((u) => u.email)].filter((x): x is string => !!x);
  let leadId: string | null = null;
  for (const m of mails) if (!leadId) leadId = await findCloseLeadIdByEmail(m).catch(() => null);
  if (!leadId && k.contact_name) leadId = await findCloseLeadIdByName(k.contact_name).catch(() => null);
  if (!leadId) leadId = await findCloseLeadIdByName(k.name).catch(() => null);
  if (!leadId) return { phones: [], emails: [] };
  const kontakte = await getCloseLeadContacts(leadId).catch(() => null);
  return { phones: kontakte?.phones ?? [], emails: kontakte?.emails ?? [] };
}

/**
 * Sofort-Zuordnung eines (neuen) Sales-Kontakts: gehört Nummer/Mail zu einem Kunden → kunde_agency_id setzen.
 * Von Hand gesetzte Markierungen (kunde_manuell) bleiben unberührt. Ohne Close (läuft im Nachrichten-Eingang).
 */
export async function ordneKundeZu(
  svc: SupabaseClient,
  candidateId: string,
  phoneE164: string | null,
  email: string | null = null,
): Promise<string | null> {
  const { nummern, mails } = await ladeKundenKennungen(svc);
  const agencyId = nummern.get(letzte9(phoneE164)) ?? (email ? mails.get(email.toLowerCase()) : undefined) ?? null;
  if (!agencyId) return null;
  await svc
    .from('candidates')
    .update({ kunde_agency_id: agencyId })
    .eq('id', candidateId)
    .eq('agency_id', SALES_AGENCY_ID)
    .neq('kunde_manuell', true);
  return agencyId;
}

/**
 * Alle aktiven Kunden: Nummer ermitteln und vorhandene Sales-WhatsApp-Kontakte (gleiche Nummer oder E-Mail –
 * von Agentur, allen Kunden-Nutzern und mit mitClose auch allen Kontakten des Close-Leads) als Kunden markieren.
 * Legt keine neuen Kontakte an. Von Hand markierte Kontakte (kunde_manuell) werden nicht angefasst.
 */
export async function verknuepfeKundenKontakte(svc: SupabaseClient, opts: { mitClose?: boolean } = {}) {
  const kunden = await ladeAktiveKunden(svc);
  const { data: cands } = await svc
    .from('candidates')
    .select('id, phone_e164, email, kunde_agency_id, kunde_manuell')
    .eq('agency_id', SALES_AGENCY_ID)
    .is('deleted_at', null);
  const kontakte = ((cands ?? []) as Array<{ id: string; phone_e164: string | null; email: string | null; kunde_agency_id: string | null; kunde_manuell?: boolean | null }>)
    .filter((c) => !c.kunde_manuell);

  // Agentur-Telefon nachziehen (Kunden-Login, optional Close) – wie bisher
  for (const k of kunden) {
    if (!k.phone) k.phone = await kundenNummer(svc, k, opts.mitClose ?? false);
  }
  const { nummern, mails } = await ladeKundenKennungen(svc, kunden);
  if (opts.mitClose) {
    for (const k of kunden) {
      const extra = await closeKennungen(svc, k).catch(() => ({ phones: [] as string[], emails: [] as string[] }));
      for (const p of extra.phones) if (letzte9(p) && !nummern.has(letzte9(p))) nummern.set(letzte9(p), k.id);
      for (const m of extra.emails) if (!mails.has(m.toLowerCase())) mails.set(m.toLowerCase(), k.id);
    }
  }

  const verknuepft = new Map<string, number>();
  for (const c of kontakte) {
    const agencyId = nummern.get(letzte9(c.phone_e164)) ?? (c.email ? mails.get(c.email.toLowerCase()) : undefined);
    if (!agencyId || c.kunde_agency_id === agencyId) continue;
    await svc.from('candidates').update({ kunde_agency_id: agencyId }).eq('id', c.id).neq('kunde_manuell', true);
    verknuepft.set(agencyId, (verknuepft.get(agencyId) ?? 0) + 1);
  }
  return kunden.map((k) => ({ id: k.id, name: k.name, nummer: normalizeToE164(k.phone), verknuepft: verknuepft.get(k.id) ?? 0 }));
}
