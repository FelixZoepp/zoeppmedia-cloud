/**
 * Einladungen und Kunden-Anlage als Job (scheduled_jobs), damit sie auch ohne Klick in der Oberfläche
 * serverseitig laufen – gleiche Logik wie „Zugänge → Einladen“ (/api/admin/agencies/[id]/zugaenge)
 * und „Kunde anlegen + einladen“ (/invites → /api/admin/agencies). Nur auf ausdrücklichen Auftrag von Felix.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendeEinladung } from '@/lib/agency-team/einladung';
import { KUNDEN_ROLLEN, type KundenRolle } from '@/lib/agency-team/access';
import { neueAgenturKennungen } from '@/lib/agencies/kennungen';
import { startPhase } from '@/lib/fulfillment/engine';
import { logActivity } from '@/lib/activity/log';

/** Job admin.einladung_senden { agency_id, email, name?, role } – Login für einen bestehenden Kunden */
export async function ladeZumKundenEin(
  svc: SupabaseClient,
  p: { agency_id: string; email: string; name?: string | null; role?: string },
): Promise<string> {
  const email = p.email.trim().toLowerCase();
  const role: KundenRolle = (KUNDEN_ROLLEN as readonly string[]).includes(p.role ?? '') ? (p.role as KundenRolle) : 'agency_owner';
  const { data: vorhanden } = await svc.from('users').select('id').ilike('email', email).maybeSingle();
  if (vorhanden) return 'zugang_vorhanden';

  // Offene, schon versendete Einladung nicht doppelt schicken
  const { data: offen } = await svc
    .from('invite_tokens')
    .select('id, token, expires_at, email_sent_at')
    .eq('agency_id', p.agency_id)
    .ilike('email', email)
    .eq('redeemed', false)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  type Einladung = { id: string; token: string; expires_at: string; email_sent_at: string | null };
  let invite = offen as Einladung | null;
  if (invite?.email_sent_at) return 'schon_eingeladen';
  if (!invite) {
    const { data, error } = await svc
      .from('invite_tokens')
      .insert({ agency_id: p.agency_id, email, name: p.name?.trim() || null, role })
      .select('id, token, expires_at, email_sent_at')
      .single();
    if (error || !data) throw new Error(`Einladung nicht angelegt: ${error?.message ?? 'unbekannt'}`);
    invite = data as Einladung;
  }
  const ok = await sendeEinladung(svc, p.agency_id, { id: invite!.id, token: invite!.token, expires_at: invite!.expires_at, email });
  if (!ok) throw new Error(`Einladungs-Mail an ${email} nicht versendet`);
  await logActivity(svc, { agency_id: p.agency_id, action: `Einladung gesendet an ${email}`, action_type: 'invite_sent', metadata: { email, role } });
  return 'versendet';
}

/** Job admin.kunde_anlegen { name, contact_name, email, phone? } – neuer Kunde (Start in Phase Zahlung) + Inhaber-Einladung */
export async function legeKundenAn(
  svc: SupabaseClient,
  p: { name: string; contact_name: string; email: string; phone?: string | null },
): Promise<string> {
  const email = p.email.trim().toLowerCase();
  const { data: da } = await svc.from('agencies').select('id').ilike('email', email).maybeSingle();
  let agencyId = (da as { id: string } | null)?.id;
  if (!agencyId) {
    const { data: agency, error } = await svc
      .from('agencies')
      .insert({ name: p.name, contact_name: p.contact_name, email, phone: p.phone || null, ...(await neueAgenturKennungen(svc, p.name)) })
      .select('id')
      .single();
    if (error || !agency) throw new Error(`Kunde nicht angelegt: ${error?.message ?? 'unbekannt'}`);
    agencyId = (agency as { id: string }).id;
    await startPhase(svc, agencyId, 'zahlung').catch((err) => console.error('[kunde_anlegen] Fulfillment-Start fehlgeschlagen:', err));
  }
  return `${agencyId}:${await ladeZumKundenEin(svc, { agency_id: agencyId, email, name: p.contact_name, role: 'agency_owner' })}`;
}
