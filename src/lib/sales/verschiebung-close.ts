/**
 * Calendly-Verschiebung in Close sichtbar machen (Job sales.close_buchung):
 * Verschiebt der Lead (oder wir) in Calendly, kommt eine Absage + neue Buchung. Gibt es für dieselbe Person
 * eine kürzlich abgesagte Buchung, gilt die neue als Verschiebung → Notiz „🔁 Termin verschoben: alt → neu“,
 * Deal-Notiz auf den neuen Termin, Slack #03-sales. Rein intern – an den Lead geht nichts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { addCloseNote } from './close';
import { SALES_AGENCY_ID } from './calendly-chain';
import { notifySales } from './notify';
import { D2D_PIPELINE_ID } from './pipelines';

const CLOSE_BASE = 'https://api.close.com/api/v1';

function closeHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`, 'Content-Type': 'application/json' };
}

export interface VorherigerTermin {
  calendlyEventId: string;
  startTime: string;
  eventType: string | null;
}

const zeitText = (iso: string) =>
  new Date(iso).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Notiztext (rein, testbar) */
export function verschiebungsText(vorher: string, neu: string, chain: 'setting' | 'beratung' | undefined): string {
  const art = chain === 'beratung' ? 'Beratungsgespräch' : 'Erstgespräch';
  return `🔁 ${art} verschoben (Calendly): ${zeitText(vorher)} Uhr → ${zeitText(neu)} Uhr`;
}

/**
 * Abgesagte Buchung derselben Person (E-Mail oder Telefon), deren Termin frühestens gestern war und die in den
 * letzten 30 Tagen angelegt wurde. Ohne Treffer: keine Verschiebung, sondern eine normale Buchung.
 */
export async function findeVorherigenTermin(
  svc: SupabaseClient,
  b: { calendlyEventId: string; email: string | null; phone: string | null; startTime: string },
  jetzt: Date = new Date(),
): Promise<VorherigerTermin | null> {
  const wer = [b.email ? `invitee_email.ilike.${b.email}` : null, b.phone ? `invitee_phone.eq.${b.phone}` : null].filter(Boolean).join(',');
  if (!wer) return null;
  const { data } = await svc
    .from('calendly_events')
    .select('calendly_event_id, start_time, event_type')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('status', 'cancelled')
    .neq('calendly_event_id', b.calendlyEventId)
    .neq('start_time', b.startTime)
    .gte('start_time', new Date(jetzt.getTime() - 864e5).toISOString())
    .gte('created_at', new Date(jetzt.getTime() - 30 * 864e5).toISOString())
    .or(wer)
    .order('created_at', { ascending: false })
    .limit(1);
  const e = ((data ?? []) as Array<{ calendly_event_id: string; start_time: string; event_type: string | null }>)[0];
  return e ? { calendlyEventId: e.calendly_event_id, startTime: e.start_time, eventType: e.event_type } : null;
}

/** Notiz am Lead, Deal-Notiz auf den neuen Termin, Slack. Fehler beim Deal sind nicht kritisch. */
export async function markiereVerschiebung(
  svc: SupabaseClient,
  leadId: string,
  b: { name: string; startTime: string; chain?: 'setting' | 'beratung' },
  vorher: VorherigerTermin,
): Promise<void> {
  const text = verschiebungsText(vorher.startTime, b.startTime, b.chain);
  await addCloseNote(leadId, text);

  const apiKey = process.env.CLOSE_API_KEY;
  if (apiKey) {
    const res = await fetch(`${CLOSE_BASE}/opportunity/?lead_id=${leadId}&status_type=active&pipeline_id=${D2D_PIPELINE_ID}&_fields=id,note`, { headers: closeHeaders(apiKey) });
    const opp = res.ok ? ((await res.json()) as { data: Array<{ id: string; note: string | null }> }).data[0] : undefined;
    if (opp) {
      const art = b.chain === 'beratung' ? 'Beratungsgespräch' : 'Setting';
      const note = `${art} über Calendly: ${zeitText(b.startTime)} Uhr (verschoben von ${zeitText(vorher.startTime)} Uhr)${opp.note ? `\n\n${opp.note}` : ''}`;
      await fetch(`${CLOSE_BASE}/opportunity/${opp.id}/`, { method: 'PUT', headers: closeHeaders(apiKey), body: JSON.stringify({ note }) }).catch(() => null);
    }
  }

  await notifySales(svc, {
    emoji: '🔁',
    title: `Verschoben: ${b.name}`,
    body: `${zeitText(vorher.startTime)} Uhr → ${zeitText(b.startTime)} Uhr`,
    type: 'system',
  });
}
