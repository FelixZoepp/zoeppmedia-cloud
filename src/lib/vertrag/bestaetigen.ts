/**
 * Vertragsbestätigung in der Cloud (ersetzt Adobe Sign für neue Kunden):
 * Kunde bestätigt die Eckdaten → PDF an Kunde + intern → Schritt „Vertrag" erledigt →
 * Buchhaltung bekommt die Aufgabe „Setup-Rechnung in Lexware stellen" (die Cloud stellt selbst keine Rechnung).
 */

import { createHash, randomBytes } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { kanonisch, euro, type VertragDaten } from './daten';
import { erzeugeBestaetigungPdf } from './pdf';
import { ersteRechnungPosition } from '@/lib/billing/setup-position';
import { findLexwareContact } from '@/lib/billing/lexware-sync';
import { setStepStatus } from '@/lib/fulfillment/engine';
import { createNotification, createNotificationForInternals } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';
import { sendVertragBestaetigt } from '@/lib/email/resend';

export interface VertragRow {
  id: string;
  agency_id: string;
  token: string;
  daten: VertragDaten;
  status: 'offen' | 'bestaetigt';
  unterzeichner_name: string | null;
  bestaetigt_am: string | null;
}

export interface BestaetigenDeps {
  sendVertragBestaetigt: typeof sendVertragBestaetigt;
  findContact: (name: string) => Promise<{ id: string } | null>;
  erzeugePdf: typeof erzeugeBestaetigungPdf;
}

const defaultDeps: BestaetigenDeps = {
  sendVertragBestaetigt,
  findContact: findLexwareContact,
  erzeugePdf: erzeugeBestaetigungPdf,
};

const BASE = () => process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
/** Wer intern eine Kopie der Vertragsbestätigung bekommt */
const internMails = () =>
  (process.env.VERTRAG_INTERN_MAIL || 'assistenz@zoeppmedia.de').split(',').map((x) => x.trim()).filter(Boolean);

export const neuerVertragToken = () => randomBytes(24).toString('hex');

export function vertragHash(daten: VertragDaten, agbUrl: string | null): string {
  return createHash('sha256').update(kanonisch(daten, agbUrl)).digest('hex');
}

export async function ladeAgbUrl(svc: SupabaseClient): Promise<string | null> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'vertrag_agb_url').maybeSingle();
  const url = ((data as { wert?: string } | null)?.wert ?? '').trim();
  return /^https?:\/\//.test(url) ? url : null;
}

export async function ladeVertrag(svc: SupabaseClient, token: string): Promise<VertragRow | null> {
  if (!/^[a-f0-9]{32,64}$/.test(token)) return null;
  const { data } = await svc
    .from('vertraege')
    .select('id, agency_id, token, daten, status, unterzeichner_name, bestaetigt_am')
    .eq('token', token)
    .maybeSingle();
  return (data as VertragRow | null) ?? null;
}

/** Nach der Bestätigung: Zugang anlegen (Einladung) – oder Login, falls schon registriert */
export async function weiterUrl(svc: SupabaseClient, agencyId: string, email: string, now: Date = new Date()): Promise<string> {
  const { data: owner } = await svc
    .from('users')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('role', 'agency_owner')
    .limit(1)
    .maybeSingle();
  if (owner) return `${BASE()}/login`;

  const { data: offen } = await svc
    .from('invite_tokens')
    .select('token, expires_at')
    .eq('agency_id', agencyId)
    .eq('redeemed', false)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const inv = offen as { token: string; expires_at: string } | null;
  if (inv && Date.parse(inv.expires_at) > now.getTime()) return `${BASE()}/register/${inv.token}`;

  const { data: neu } = await svc.from('invite_tokens').insert({ agency_id: agencyId, email }).select('token').single();
  const token = (neu as { token?: string } | null)?.token;
  return token ? `${BASE()}/register/${token}` : `${BASE()}/login`;
}

export type BestaetigenErgebnis =
  | { status: 'bestaetigt' | 'schon_bestaetigt'; weiter_url: string }
  | { status: 'nicht_gefunden' }
  | { status: 'ungueltig'; fehler: string };

export async function bestaetigeVertrag(
  svc: SupabaseClient,
  token: string,
  eingabe: { name: string; akzeptiert: boolean; ip: string; userAgent: string },
  deps: BestaetigenDeps = defaultDeps,
  now: Date = new Date(),
): Promise<BestaetigenErgebnis> {
  const name = eingabe.name.trim().replace(/\s+/g, ' ');
  if (name.length < 3 || name.length > 120) return { status: 'ungueltig', fehler: 'Bitte deinen vollständigen Namen eintragen.' };
  if (!eingabe.akzeptiert) return { status: 'ungueltig', fehler: 'Bitte bestätige die Vertragsbedingungen.' };

  const vertrag = await ladeVertrag(svc, token);
  if (!vertrag) return { status: 'nicht_gefunden' };
  const daten = vertrag.daten;
  if (vertrag.status === 'bestaetigt') {
    return { status: 'schon_bestaetigt', weiter_url: await weiterUrl(svc, vertrag.agency_id, daten.email, now) };
  }

  const agbUrl = await ladeAgbUrl(svc);
  const hash = vertragHash(daten, agbUrl);
  const bestaetigtAm = now.toISOString();

  // Atomar: nur aus "offen" – zweimal bestätigen löst die Folgeschritte nur einmal aus
  const { data: moved, error } = await svc
    .from('vertraege')
    .update({
      status: 'bestaetigt',
      unterzeichner_name: name,
      bestaetigt_am: bestaetigtAm,
      ip: eingabe.ip.slice(0, 64),
      user_agent: eingabe.userAgent.slice(0, 400),
      daten_hash: hash,
      agb_url: agbUrl,
    })
    .eq('id', vertrag.id)
    .eq('status', 'offen')
    .select('id');
  if (error) throw new Error(`Bestätigung nicht gespeichert: ${error.message}`);
  const weiter = await weiterUrl(svc, vertrag.agency_id, daten.email, now);
  if (!((moved ?? []) as unknown[]).length) return { status: 'schon_bestaetigt', weiter_url: weiter };

  const agencyId = vertrag.agency_id;

  // 1. Schritt „Vertrag unterschrieben" abhaken
  try {
    const { data: step } = await svc
      .from('client_steps')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('step_key', 'z_vertrag')
      .not('status', 'in', '(erledigt,nicht_noetig)')
      .maybeSingle();
    if (step) await setStepStatus(svc, (step as { id: string }).id, 'erledigt', { kommentar: `In der Cloud bestätigt von ${name}`, now });
  } catch (err) {
    console.error('[vertrag] Schritt Vertrag nicht abgehakt:', err);
  }

  // 2. Bestätigung als PDF an Kunde + intern
  try {
    const pdf = await deps.erzeugePdf(daten, { unterzeichner_name: name, bestaetigt_am: bestaetigtAm, ip: eingabe.ip, daten_hash: hash, agb_url: agbUrl });
    await deps.sendVertragBestaetigt({ to: daten.email, bcc: internMails(), name: daten.ansprechpartner, firma: daten.firma, weiterUrl: weiter, pdf });
  } catch (err) {
    console.error('[vertrag] Bestätigungs-Mail fehlgeschlagen:', err);
    await createNotificationForInternals(svc, {
      title: `Vertragsbestätigung nicht verschickt: ${daten.firma}`,
      body: 'Der Vertrag ist bestätigt, aber die Mail mit dem PDF ging nicht raus.',
      type: 'system',
      entity_type: 'agency',
      entity_id: agencyId,
    }).catch(() => {});
  }

  // 3. Lexware-Kontakt nur suchen und verknüpfen (nichts in Lexware anlegen)
  let lexKontakt: string | null = null;
  try {
    const { data: a } = await svc.from('agencies').select('lex_contact_id').eq('id', agencyId).maybeSingle();
    lexKontakt = (a as { lex_contact_id?: string | null } | null)?.lex_contact_id ?? null;
    if (!lexKontakt) {
      lexKontakt = (await deps.findContact(daten.firma))?.id ?? null;
      if (lexKontakt) await svc.from('agencies').update({ lex_contact_id: lexKontakt }).eq('id', agencyId);
    }
  } catch (err) {
    console.error('[vertrag] Lexware-Kontakt nicht gesucht:', err);
  }

  // 4. Aufgabe für die Buchhaltung: Setup-Rechnung von Hand in Lexware stellen
  try {
    const pos = ersteRechnungPosition({ setup_betrag: daten.setup_netto, mrr: daten.monat_netto, paket_name: daten.paket, start_datum: daten.start_datum });
    const betrag = pos
      ? `${pos.bezeichnung}: ${euro(pos.betrag_netto)} netto / ${euro(pos.betrag_brutto)} brutto`
      : 'Betrag bitte aus dem Vertrag übernehmen';
    const kontakt = lexKontakt ? `Lexware-Kontakt verknüpft (ID ${lexKontakt})` : 'Lexware-Kontakt noch nicht verknüpft – bitte unter Buchhaltung zuordnen';
    const hinweis = `Vertrag bestätigt am ${new Date(bestaetigtAm).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}. ${betrag}. ${kontakt}. Die Cloud erkennt die Rechnung und den Zahlungseingang danach selbst.`;
    const { data: s } = await svc
      .from('client_steps')
      .select('id, owner_user_id')
      .eq('agency_id', agencyId)
      .eq('step_key', 'z_rechnung_setup')
      .not('status', 'in', '(erledigt,nicht_noetig)')
      .maybeSingle();
    const step = s as { id: string; owner_user_id: string | null } | null;
    if (step) {
      await svc
        .from('client_steps')
        .update({ faellig_am: bestaetigtAm.slice(0, 10), kommentar: hinweis, updated_at: bestaetigtAm })
        .eq('id', step.id);
    }
    const nachricht = {
      title: `Setup-Rechnung in Lexware stellen: ${daten.firma}`,
      body: hinweis.slice(0, 300),
      type: 'task_due' as const,
      entity_type: 'agency' as const,
      entity_id: agencyId,
      push_url: `/clients/${agencyId}`,
    };
    if (step?.owner_user_id) await createNotification(svc, { ...nachricht, user_id: step.owner_user_id, agency_id: agencyId });
    else await createNotificationForInternals(svc, nachricht);
  } catch (err) {
    console.error('[vertrag] Rechnungs-Aufgabe nicht angelegt:', err);
  }

  await logActivity(svc, {
    agency_id: agencyId,
    user_id: null,
    action: `Vertrag in der Cloud bestätigt von ${name}`,
    action_type: 'vertrag_bestaetigt',
    metadata: { daten_hash: hash },
  }).catch(() => {});

  return { status: 'bestaetigt', weiter_url: weiter };
}
