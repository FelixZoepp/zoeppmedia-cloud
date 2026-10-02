/**
 * Sales-Bot: Klick-Tracking für "Termin buchen"-Buttons in WhatsApp-Vorlagen.
 *
 * Button-URL: https://cloud.zoeppmedia.de/api/go/{token}
 * Token = <prospectId>.<ziel>.<quelle>.<signatur>  (signiert mit CRON_SECRET, nicht fälschbar)
 *
 * Klick → Notiz am Close-Lead + Job "sales.click_check" in 30 Min. → Weiterleitung zu Calendly
 * (Name/E-Mail vorausgefüllt). Bucht der Lead bis dahin nicht: Slack "anrufen" + Close-Aufgabe.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/activity/log';
import { SALES_AGENCY_ID } from './calendly-chain';
import { addCloseNoteByEmail, addCloseTask } from './close';
import { notifySales } from './notify';

export type BookingTarget = 'setting' | 'beratung';

/** Calendly-Buchungsseiten je Ziel */
export const BOOKING_URLS: Record<BookingTarget, string> = {
  setting: 'https://calendly.com/zoepp-media/1-1-kurzvideo-workshop-vorbereitung-d2d',
  beratung: 'https://calendly.com/zoepp-media/1-1-workshop-meeting-mit-felix-zoepp-klon',
};

/** Wie lange nach dem Klick auf eine Buchung gewartet wird, bevor "anrufen" kommt. */
export const CLICK_CHECK_DELAY_MS = 30 * 60 * 1000;

function sign(data: string): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(`sales-go:${data}`).digest('base64url').slice(0, 16);
}

/** Token für den Button-Link bauen. `source` ist der Vorlagenname (z.B. fu_2). */
export function buildClickToken(prospectId: string, target: BookingTarget, source: string): string {
  const data = `${prospectId}.${target === 'beratung' ? 'b' : 's'}.${source}`;
  const sig = sign(data);
  if (!sig) throw new Error('CRON_SECRET fehlt — Tracking-Link kann nicht signiert werden');
  return `${data}.${sig}`;
}

export function parseClickToken(token: string): { prospectId: string; target: BookingTarget; source: string } | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [prospectId, t, source, sig] = parts;
  const expected = sign(`${prospectId}.${t}.${source}`);
  if (!expected || sig.length !== expected.length) return null;
  if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  if (!/^[0-9a-f-]{36}$/.test(prospectId) || !['s', 'b'].includes(t) || !/^[a-z0-9_]{1,40}$/.test(source)) return null;
  return { prospectId, target: t === 'b' ? 'beratung' : 'setting', source };
}

/** Link-Vorschau-Bots (WhatsApp/Facebook) zählen nicht als Klick. */
export function isPreviewBot(userAgent: string | null): boolean {
  return !!userAgent && /facebookexternalhit|whatsapp\/|facebot|slackbot|twitterbot|bot\b|crawler|preview/i.test(userAgent);
}

export function calendlyUrlWithPrefill(target: BookingTarget, prefill: { name?: string | null; email?: string | null }): string {
  const url = new URL(BOOKING_URLS[target]);
  if (prefill.name) url.searchParams.set('name', prefill.name);
  if (prefill.email) url.searchParams.set('email', prefill.email);
  return url.toString();
}

interface ClickCheckPayload {
  prospect_id: string;
  clicked_at: string;
  source: string;
}

/**
 * Klick verarbeiten und das Ziel (Calendly mit Vorausfüllung) zurückgeben.
 * Mehrfachklicks: solange ein Check offen ist, wird kein zweiter geplant.
 */
export async function recordClick(
  svc: SupabaseClient,
  click: { prospectId: string; target: BookingTarget; source: string },
  now: Date = new Date(),
): Promise<string> {
  const { data: p } = await svc
    .from('candidates')
    .select('id, name, email, phone_e164')
    .eq('id', click.prospectId)
    .eq('agency_id', SALES_AGENCY_ID)
    .maybeSingle();
  const prospect = p as { id: string; name: string; email: string | null; phone_e164: string | null } | null;
  if (!prospect) return BOOKING_URLS[click.target];

  const { data: open } = await svc
    .from('scheduled_jobs')
    .select('id')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('type', 'sales.click_check')
    .eq('status', 'pending')
    .eq('payload->>prospect_id', prospect.id)
    .limit(1)
    .maybeSingle();

  if (!open) {
    await svc.from('scheduled_jobs').insert({
      agency_id: SALES_AGENCY_ID,
      type: 'sales.click_check',
      run_at: new Date(now.getTime() + CLICK_CHECK_DELAY_MS).toISOString(),
      payload: { prospect_id: prospect.id, clicked_at: now.toISOString(), source: click.source } satisfies ClickCheckPayload,
      status: 'pending',
    });

    const zeit = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    await logActivity(svc, {
      agency_id: SALES_AGENCY_ID,
      candidate_id: prospect.id,
      action: `Hat auf "Termin buchen" geklickt (${click.source}, ${zeit} Uhr)`,
      action_type: 'other',
      metadata: { kind: 'sales_link_click', source: click.source, target: click.target },
    });
    await addCloseNoteByEmail(
      prospect.email,
      `👆 WhatsApp: Hat auf "Termin buchen" geklickt (${click.source}, ${zeit} Uhr).`,
      prospect.phone_e164,
    ).catch((err) => console.error('[sales] Close-Notiz (Klick) fehlgeschlagen:', err));
  }

  return calendlyUrlWithPrefill(click.target, { name: prospect.name, email: prospect.email });
}

/** Job sales.click_check: 30 Min. nach dem Klick — keine Buchung? → anrufen. */
export async function processSalesClickCheck(
  svc: SupabaseClient,
  payload: ClickCheckPayload,
  today: string,
): Promise<'booked' | 'call'> {
  const { data: booking } = await svc
    .from('calendly_events')
    .select('id')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('candidate_id', payload.prospect_id)
    .gte('created_at', payload.clicked_at)
    .limit(1)
    .maybeSingle();
  if (booking) return 'booked';

  const { data: p } = await svc
    .from('candidates')
    .select('id, name, email, phone_e164')
    .eq('id', payload.prospect_id)
    .maybeSingle();
  const prospect = p as { id: string; name: string; email: string | null; phone_e164: string | null } | null;
  if (!prospect) return 'call';

  const { data: conv } = await svc
    .from('conversations')
    .select('id')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('candidate_id', prospect.id)
    .maybeSingle();

  let inClose = false;
  try {
    inClose = !!(await addCloseTask(
      { email: prospect.email, phone: prospect.phone_e164 },
      `Heute anrufen: ${prospect.name} hat auf "Termin buchen" geklickt (${payload.source}), aber nicht gebucht – ${prospect.phone_e164 ?? ''}`,
      today,
    ));
  } catch (err) {
    console.error('[sales] Close-Aufgabe (Klick ohne Buchung) fehlgeschlagen:', err);
  }

  await notifySales(svc, {
    emoji: '📞',
    title: `${prospect.name} hat geklickt, aber nicht gebucht — jetzt anrufen!`,
    body: `Klick auf "Termin buchen" in ${payload.source}, seit 30 Minuten keine Buchung.${inClose ? ' Aufgabe "Heute anrufen" ist in Close angelegt.' : ''}`,
    type: 'task_due',
    phone: prospect.phone_e164,
    conversationId: (conv as { id: string } | null)?.id ?? null,
  });
  return 'call';
}
