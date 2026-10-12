/**
 * Termin ohne Calendly: Termin-Erinnerungen an Leads (Bestätigung am Vortag, Erinnerung kurz vorher) laufen nur
 * für Calendly-Buchungen (calendly-chain.ts). Wird ein Setting/Closing/CC2 nur im Gesprächsprotokoll gelegt,
 * prüft Job sales.termin_check 15 Min. später, ob es dazu eine Calendly-Buchung gibt.
 * Fehlt sie → Hinweis an das Team (Push + Slack): „Bitte über Calendly einbuchen, sonst keine Erinnerung“.
 * Rein intern – an den Lead geht nichts. Schalter unter /admin/freigaben („termin_check“).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SALES_AGENCY_ID } from './calendly-chain';
import { getCloseLeadContacts } from './close';
import { notifySales } from './notify';
import { istFreigegeben } from '@/lib/freigaben';

const ziffern = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').replace(/^00/, '').replace(/^49/, '').replace(/^0/, '');

/** Ist das ein Termin, für den der Lead eine Erinnerung bekommen sollte? (rein, testbar) */
export function istLeadTermin(plan: { termin?: string | null; settingOpportunity?: boolean; settingTerminiert?: boolean; closingTerminiert?: boolean; oppStatus?: string }, jetzt: Date): boolean {
  if (!plan.termin || new Date(plan.termin).getTime() <= jetzt.getTime()) return false;
  return !!(plan.settingOpportunity || plan.settingTerminiert || plan.closingTerminiert || plan.oppStatus === 'cc2' || plan.oppStatus === 'closing_terminiert');
}

export async function planeTerminCheck(svc: SupabaseClient, leadId: string, termin: string, art: string): Promise<void> {
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'sales.termin_check',
    run_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    payload: { lead_id: leadId, termin, art },
    status: 'pending',
    dedupe_key: `sales.termin_check:${leadId}:${termin}`,
  });
  if (error && error.code !== '23505') throw new Error(`Termin-Check nicht geplant: ${error.message}`);
}

/** Job sales.termin_check */
export async function pruefeTermin(svc: SupabaseClient, p: { lead_id: string; termin: string; art: string }): Promise<string> {
  if (!(await istFreigegeben(svc, 'termin_check'))) return 'aus';
  const k = await getCloseLeadContacts(p.lead_id);
  if (!k) return 'kein_lead';
  const t = new Date(p.termin).getTime();
  const { data } = await svc
    .from('calendly_events')
    .select('invitee_email, invitee_phone, start_time')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('status', 'scheduled')
    .gte('start_time', new Date(t - 3 * 3600_000).toISOString())
    .lte('start_time', new Date(t + 3 * 3600_000).toISOString());
  const mails = k.emails.map((m) => m.toLowerCase());
  const tels = k.phones.map(ziffern).filter((x) => x.length >= 6);
  const treffer = ((data ?? []) as Array<{ invitee_email: string | null; invitee_phone: string | null }>).some(
    (e) => (e.invitee_email && mails.includes(e.invitee_email.toLowerCase())) || tels.includes(ziffern(e.invitee_phone)),
  );
  if (treffer) return 'in_calendly';
  const wann = new Date(p.termin).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
  await notifySales(svc, {
    emoji: '📅',
    title: `${p.art} mit ${k.leadName ?? k.contactName ?? 'Lead'} (${wann} Uhr) ist nicht in Calendly`,
    body: 'Der Lead bekommt so keine Bestätigung und keine Erinnerung – No-Show-Gefahr. Bitte den Termin über den Calendly-Link einbuchen.',
    type: 'task_due',
    phone: k.phones[0] ?? null,
  });
  return 'hinweis';
}
