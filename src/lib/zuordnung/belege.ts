/**
 * Indeed-Belege: Indeed-Benachrichtigungen, die aus dem Indeed-Konto eines Kunden an bewerber+<kunde>@…
 * weitergeleitet wurden. Sie sind die zweite, unabhängige Quelle für Manatal-Bewerber („doppelter Boden“):
 * Ein Manatal-Bewerber geht nur an Kunde X, wenn es zu dieser Person einen Beleg aus dem Indeed-Konto von X gibt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizePhoneE164 } from '@/lib/phone';

/** Name vergleichbar machen: klein, Umlaute aufgelöst, Wörter sortiert („Schmitt Jonathan“ = „Jonathan Schmitt“) (rein, testbar) */
export function nameNorm(name: string | null | undefined): string | null {
  if (!name) return null;
  const w = name
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z]+/)
    .filter((x) => x.length >= 2);
  return w.length ? [...new Set(w)].sort().join(' ') : null;
}

export interface Person {
  name: string | null;
  email: string | null;
  phone: string | null;
}

export interface Beleg {
  id: string;
  agency_id: string;
  name_norm: string | null;
  email: string | null;
  phone_e164: string | null;
  empfangen_am: string;
}

/** Passt ein Beleg zur Person? Telefon oder E-Mail gleich, oder voller Name gleich (rein, testbar) */
export function belegPasst(b: Pick<Beleg, 'name_norm' | 'email' | 'phone_e164'>, p: Person): boolean {
  const tel = normalizePhoneE164(p.phone);
  if (tel && b.phone_e164 && tel === b.phone_e164) return true;
  const mail = p.email?.trim().toLowerCase();
  if (mail && b.email && mail === b.email.toLowerCase()) return true;
  const n = nameNorm(p.name);
  // Name nur, wenn er aus mindestens zwei Wörtern besteht (Vor- und Nachname)
  return !!n && n.includes(' ') && n === b.name_norm;
}

/** Belege zur Person im Zeitfenster um die Bewerbung (±3 Tage), über alle Kunden */
export async function findeBelege(svc: SupabaseClient, p: Person, um: Date): Promise<Beleg[]> {
  const von = new Date(um.getTime() - 3 * 864e5).toISOString();
  const bis = new Date(um.getTime() + 3 * 864e5).toISOString();
  const tel = normalizePhoneE164(p.phone);
  const mail = p.email?.trim().toLowerCase();
  const n = nameNorm(p.name);
  // Werte in Anführungszeichen (Namen enthalten Leerzeichen); Zeichen, die den Filter brechen, entfernen
  const q = (v: string) => `"${v.replace(/["\\,()]/g, '')}"`;
  const filter = [tel ? `phone_e164.eq.${q(tel)}` : null, mail ? `email.eq.${q(mail)}` : null, n && n.includes(' ') ? `name_norm.eq.${q(n)}` : null].filter(Boolean) as string[];
  if (!filter.length) return [];
  const { data, error } = await svc
    .from('indeed_belege')
    .select('id, agency_id, name_norm, email, phone_e164, empfangen_am')
    .gte('empfangen_am', von)
    .lte('empfangen_am', bis)
    .or(filter.join(','))
    .limit(200);
  if (error) throw new Error(`Indeed-Belege nicht lesbar: ${error.message}`);
  return ((data ?? []) as Beleg[]).filter((b) => belegPasst(b, p));
}

/** Hat der Kunde überhaupt schon Indeed-Belege geschickt (Weiterleitung eingerichtet)? */
export async function kundeHatBelege(svc: SupabaseClient, agencyId: string): Promise<boolean> {
  const { count } = await svc.from('indeed_belege').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId);
  return (count ?? 0) > 0;
}

export async function speichereIndeedBeleg(
  svc: SupabaseClient,
  b: { agencyId: string; name: string | null; email: string | null; phone: string | null; stellentitel: string | null; emailId: string | null },
): Promise<void> {
  const { error } = await svc.from('indeed_belege').insert({
    agency_id: b.agencyId,
    name_norm: nameNorm(b.name),
    email: b.email?.trim().toLowerCase() || null,
    phone_e164: normalizePhoneE164(b.phone),
    stellentitel: b.stellentitel,
    email_id: b.emailId,
  });
  if (error) console.error('[belege] Indeed-Beleg nicht gespeichert:', error.message);
}
