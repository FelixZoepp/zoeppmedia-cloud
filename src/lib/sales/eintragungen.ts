/**
 * Eintragungen (neue Leads in Close) → bucht der Lead direkt einen Termin?
 * Nach 10 Minuten ohne Buchung: Aufgabe „Jetzt anrufen“ in Close + Benachrichtigung (Speed-to-Lead).
 * Kennzahlen fürs Sales-Controlling: Direktbuchungen, kein Termin nach 10 Min., später gebucht.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from './calendly-chain';
import { addCloseTaskForLead, ladeCloseLead } from './close';
import { notifySales } from './notify';

export const WARTEZEIT_MIN = 10;
const MIN = 60_000;

const ziffern = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').replace(/^00/, '').replace(/^49/, '').replace(/^0/, '');

export type Ergebnis = 'offen' | 'direkt_gebucht' | 'nicht_gebucht' | 'spaeter_gebucht';

/** Ergebnis aus Eintragungs- und Buchungszeit (rein, testbar) */
export function ergebnisFuer(eingetragen: Date, gebucht: Date | null, jetzt: Date): Ergebnis {
  if (gebucht) return gebucht.getTime() - eingetragen.getTime() <= WARTEZEIT_MIN * MIN ? 'direkt_gebucht' : 'spaeter_gebucht';
  return jetzt.getTime() - eingetragen.getTime() >= WARTEZEIT_MIN * MIN ? 'nicht_gebucht' : 'offen';
}

/** Close-Webhook lead.created → Eintragung merken und Prüfung in 10 Minuten planen */
export async function erfasseEintragung(svc: SupabaseClient, leadId: string): Promise<boolean> {
  const lead = await ladeCloseLead(leadId);
  if (!lead) return false;
  const eingetragen = new Date(lead.erstellt);
  const { error } = await svc.from('sales_eintragungen').upsert(
    { lead_id: lead.id, name: lead.name, email: lead.email, phone: lead.phone, quelle: lead.quelle, eingetragen_am: eingetragen.toISOString() },
    { onConflict: 'lead_id', ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);
  // Einzeln einfügen: der Dedupe-Index ist partiell – 23505 heißt „schon geplant“
  const { error: jobErr } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.eintragung_check',
    run_at: new Date(Math.max(Date.now(), eingetragen.getTime() + WARTEZEIT_MIN * MIN)).toISOString(),
    payload: { lead_id: lead.id },
    status: 'pending',
    dedupe_key: `sales.eintragung_check:${lead.id}`,
  });
  if (jobErr && jobErr.code !== '23505') throw new Error(jobErr.message);
  return true;
}

/** Buchung (Calendly) einer Eintragung zuordnen – über E-Mail oder Telefonnummer */
export async function markiereBuchung(svc: SupabaseClient, b: { email: string | null; phone: string | null; gebuchtAm: Date }): Promise<void> {
  const seit = new Date(b.gebuchtAm.getTime() - 30 * 864e5).toISOString();
  const { data } = await svc
    .from('sales_eintragungen')
    .select('lead_id, email, phone, eingetragen_am')
    .is('gebucht_am', null)
    .gte('eingetragen_am', seit)
    .lte('eingetragen_am', b.gebuchtAm.toISOString());
  const mail = b.email?.toLowerCase() ?? null;
  const tel = ziffern(b.phone);
  const treffer = ((data ?? []) as Array<{ lead_id: string; email: string | null; phone: string | null; eingetragen_am: string }>).find(
    (e) => (mail && e.email?.toLowerCase() === mail) || (tel.length >= 6 && ziffern(e.phone) === tel),
  );
  if (!treffer) return;
  await svc
    .from('sales_eintragungen')
    .update({ gebucht_am: b.gebuchtAm.toISOString(), ergebnis: ergebnisFuer(new Date(treffer.eingetragen_am), b.gebuchtAm, b.gebuchtAm) })
    .eq('lead_id', treffer.lead_id);
}

/** Job sales.eintragung_check (10 Min. nach der Eintragung) */
export async function pruefeEintragung(svc: SupabaseClient, payload: { lead_id: string }, heute: string, jetzt: Date = new Date()): Promise<Ergebnis> {
  const { data } = await svc.from('sales_eintragungen').select('*').eq('lead_id', payload.lead_id).maybeSingle();
  const e = data as { lead_id: string; name: string | null; email: string | null; phone: string | null; eingetragen_am: string; gebucht_am: string | null; quelle: string | null } | null;
  if (!e) return 'offen';

  // Buchung evtl. noch nicht zugeordnet (z. B. andere Schreibweise der Nummer) → in den Calendly-Buchungen nachsehen
  let gebucht = e.gebucht_am ? new Date(e.gebucht_am) : null;
  if (!gebucht) {
    const { data: evs } = await svc
      .from('calendly_events')
      .select('invitee_email, invitee_phone, created_at')
      .eq('agency_id', SALES_AGENCY_ID)
      .gte('created_at', e.eingetragen_am);
    const tel = ziffern(e.phone);
    const ev = ((evs ?? []) as Array<{ invitee_email: string | null; invitee_phone: string | null; created_at: string }>).find(
      (x) => (e.email && x.invitee_email?.toLowerCase() === e.email.toLowerCase()) || (tel.length >= 6 && ziffern(x.invitee_phone) === tel),
    );
    if (ev) gebucht = new Date(ev.created_at);
  }

  const ergebnis = ergebnisFuer(new Date(e.eingetragen_am), gebucht, jetzt);
  await svc.from('sales_eintragungen').update({ ergebnis, gebucht_am: gebucht?.toISOString() ?? null }).eq('lead_id', e.lead_id);
  if (ergebnis !== 'nicht_gebucht') return ergebnis;

  // Kein Termin nach 10 Minuten → sofort anrufen
  const text = `Jetzt anrufen: ${e.name ?? 'Lead'} hat sich eingetragen, aber nach ${WARTEZEIT_MIN} Min. keinen Termin gebucht${e.phone ? ` – ${e.phone}` : ''}`;
  await addCloseTaskForLead(e.lead_id, text, heute).catch((err) => console.error('[sales] Aufgabe (Eintragung) fehlgeschlagen:', err));
  await svc.from('sales_eintragungen').update({ anruf_aufgabe_am: jetzt.toISOString() }).eq('lead_id', e.lead_id);
  await notifySales(svc, {
    emoji: '📞',
    title: `${e.name ?? 'Neuer Lead'} – kein Termin nach ${WARTEZEIT_MIN} Min.`,
    body: `Eingetragen um ${new Date(e.eingetragen_am).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })} Uhr${e.quelle ? ` (${e.quelle})` : ''}, noch nicht gebucht. Aufgabe „Jetzt anrufen“ ist in Close.`,
    type: 'task_due',
    phone: e.phone,
  });
  return ergebnis;
}

export interface EintragungsZahlen {
  eintragungen: number;
  direkt: number;
  direktQuote: number | null;
  nichtGebucht10: number;
  nichtGebucht10Quote: number | null;
  spaeter: number;
  ohneTermin: number;
  /** Median Minuten bis zur Buchung (nur gebuchte) */
  medianMinBisBuchung: number | null;
}

export function eintragungsZahlen(rows: Array<{ eingetragen_am: string; gebucht_am: string | null; ergebnis: Ergebnis }>): EintragungsZahlen {
  const n = rows.length;
  const direkt = rows.filter((r) => r.ergebnis === 'direkt_gebucht').length;
  const spaeter = rows.filter((r) => r.ergebnis === 'spaeter_gebucht').length;
  // „Kein Termin nach 10 Min.“ = alle, die nicht direkt gebucht haben (auch wenn sie später nach Anruf buchen)
  const nicht = rows.filter((r) => r.ergebnis === 'nicht_gebucht' || r.ergebnis === 'spaeter_gebucht').length;
  const minuten = rows
    .filter((r) => r.gebucht_am)
    .map((r) => (new Date(r.gebucht_am!).getTime() - new Date(r.eingetragen_am).getTime()) / MIN)
    .sort((a, b) => a - b);
  const pct = (a: number) => (n ? Math.round((a / n) * 100) : null);
  return {
    eintragungen: n,
    direkt,
    direktQuote: pct(direkt),
    nichtGebucht10: nicht,
    nichtGebucht10Quote: pct(nicht),
    spaeter,
    ohneTermin: rows.filter((r) => r.ergebnis === 'nicht_gebucht').length,
    medianMinBisBuchung: minuten.length ? Math.round(minuten[Math.floor(minuten.length / 2)]) : null,
  };
}
