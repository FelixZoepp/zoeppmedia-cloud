/**
 * Sales-Kette: eingehende WhatsApp-Antworten von Prospects auswerten.
 *
 * "Ja, ich bin dabei" (Quick-Reply aus setting_/beratung_bestaetigung) →
 *   Bestätigung im Aktivitätslog + Close-Notiz + Benachrichtigung an Felix.
 *   Bei der Beratung zusätzlich die versprochenen Kundenerfahrungen (Videos)
 *   als Freitext senden — das 24h-Fenster ist durch die Antwort gerade offen.
 * "Ruf mich heute an" (Quick-Reply aus noshow_1_anruf) →
 *   Aufgabe "Heute anrufen" am Close-Lead + Slack #03-sales.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { logActivity } from '@/lib/activity/log';
import { addCloseNoteByEmail, addCloseTask } from './close';
import { notifySales } from './notify';

const TIMEZONE = 'Europe/Berlin';

/** Erkennt die Bestätigung (Button-Text oder sinngleiche Freitext-Antwort). */
export function isConfirmationReply(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase().replace(/[!.\s]+$/g, '');
  return (
    t.includes('ich bin dabei') ||
    ['ja', 'jap', 'jo', 'passt', 'bestätigt', 'bestätige', 'ich komme', 'bin dabei'].includes(t)
  );
}

export interface KundenVideo {
  titel: string;
  url: string;
}

/**
 * Kundenerfahrungs-Videos aus der Umgebungsvariable SALES_KUNDENVIDEOS lesen.
 * Format: eine Zeile pro Video, "Titel | https://…". Leere/kaputte Zeilen werden ignoriert.
 */
export function parseKundenVideos(raw: string | undefined): KundenVideo[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n|\\n/)
    .map((line) => {
      const idx = line.lastIndexOf('|');
      if (idx === -1) return null;
      const titel = line.slice(0, idx).trim();
      const url = line.slice(idx + 1).trim();
      return titel && /^https?:\/\//.test(url) ? { titel, url } : null;
    })
    .filter((v): v is KundenVideo => v !== null);
}

export function buildKundenVideosText(vorname: string, videos: KundenVideo[]): string {
  const liste = videos.map((v) => `▶ ${v.titel}\n${v.url}`).join('\n\n');
  return `Danke ${vorname}, super! Wie versprochen hier ein paar Kundenerfahrungen zur Vorbereitung:\n\n${liste}\n\nBis bald, Felix`;
}

export interface SalesReplyInput {
  agencyId: string;
  candidateId: string;
  candidateName: string;
  candidatePhone: string;
  conversationId: string;
  waAccountId: string;
  text: string;
}

/** Erkennt den Rückrufwunsch (Button "Ruf mich heute an" aus noshow_1_anruf oder sinngleicher Text). */
export function isCallbackReply(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim().toLowerCase();
  return /ruf(e|t)?\s+(mich|uns)\b.*\b(an|zurück)\b/.test(t) || t.includes('rückruf');
}

/** Heutiges Datum in Berlin als YYYY-MM-DD (für Close-Aufgaben). */
export function todayBerlin(now: Date = new Date()): string {
  return now.toLocaleDateString('sv-SE', { timeZone: TIMEZONE });
}

export type SalesReplyKind = 'confirmed' | 'callback' | null;

/**
 * Antwort eines Prospects auswerten. Gibt zurück, was erkannt wurde — bei null
 * meldet der Inbound-Handler die Nachricht als normale Antwort ans Team.
 */
export async function handleSalesReply(svc: SupabaseClient, input: SalesReplyInput): Promise<SalesReplyKind> {
  if (isCallbackReply(input.text)) {
    await handleCallback(svc, input);
    return 'callback';
  }
  if (isConfirmationReply(input.text)) {
    return (await handleConfirmation(svc, input)) ? 'confirmed' : null;
  }
  return null;
}

async function handleCallback(svc: SupabaseClient, input: SalesReplyInput): Promise<void> {
  const { data: p } = await svc.from('candidates').select('email').eq('id', input.candidateId).maybeSingle();
  const email = (p as { email: string | null } | null)?.email ?? null;

  let closeLeadId: string | null = null;
  try {
    closeLeadId = await addCloseTask(
      { email, phone: input.candidatePhone },
      `Heute anrufen: ${input.candidateName} wünscht Rückruf (WhatsApp: "${input.text.trim()}") – ${input.candidatePhone}`,
      todayBerlin(),
    );
  } catch (err) {
    console.error('[sales] Close-Aufgabe fehlgeschlagen:', err);
  }

  await notifySales(svc, {
    emoji: '📞',
    title: `Rückruf gewünscht: ${input.candidateName}`,
    body: `Möchte heute angerufen werden. ${closeLeadId ? 'Aufgabe "Heute anrufen" ist in Close angelegt.' : '⚠️ Lead nicht in Close gefunden — keine Aufgabe angelegt.'}`,
    type: 'task_due',
    phone: input.candidatePhone,
    conversationId: input.conversationId,
  });

  await logActivity(svc, {
    agency_id: input.agencyId,
    candidate_id: input.candidateId,
    action: 'Rückruf per WhatsApp gewünscht',
    action_type: 'other',
    metadata: { kind: 'sales_callback_requested', close_lead_id: closeLeadId },
  });
}

/** Bestätigung verarbeiten. false = kein offener Termin oder schon bestätigt. */
async function handleConfirmation(svc: SupabaseClient, input: SalesReplyInput): Promise<boolean> {

  // Nächster noch offener Termin dieses Prospects
  const { data: evt } = await svc
    .from('calendly_events')
    .select('id, calendly_event_id, event_type, start_time, invitee_email')
    .eq('agency_id', input.agencyId)
    .eq('candidate_id', input.candidateId)
    .eq('status', 'scheduled')
    .gte('start_time', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
    .order('start_time', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!evt) return false;
  const event = evt as {
    id: string;
    calendly_event_id: string;
    event_type: string | null;
    start_time: string;
    invitee_email: string | null;
  };

  // Doppelte Bestätigung (zweiter Klick) → nichts erneut auslösen
  const { data: already } = await svc
    .from('activity_log')
    .select('id')
    .eq('candidate_id', input.candidateId)
    .eq('metadata->>kind', 'sales_confirmed')
    .eq('metadata->>calendly_event_id', event.calendly_event_id)
    .limit(1)
    .maybeSingle();
  if (already) return false;

  const isBeratung = (event.event_type ?? '').toLowerCase().includes('beratung');
  const label = isBeratung ? 'Beratungsgespräch' : 'Erstgespräch';
  const start = new Date(event.start_time);
  const wann = `${start.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', timeZone: TIMEZONE })} um ${start.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: TIMEZONE })} Uhr`;

  await logActivity(svc, {
    agency_id: input.agencyId,
    candidate_id: input.candidateId,
    action: `${label} per WhatsApp bestätigt (${wann})`,
    // activity_log.action_type hat eine CHECK-Liste — Sales-Typ steht in metadata.kind
    action_type: 'other',
    metadata: { kind: 'sales_confirmed', calendly_event_id: event.calendly_event_id },
  });

  await notifySales(svc, {
    emoji: '✅',
    title: `${input.candidateName} hat bestätigt`,
    body: `${label} am ${wann} ist per WhatsApp bestätigt.`,
    type: 'system',
    phone: input.candidatePhone,
    conversationId: input.conversationId,
  });

  await addCloseNoteByEmail(
    event.invitee_email,
    `WhatsApp: ${label} am ${wann} vom Kunden bestätigt ("${input.text.trim()}").`,
    input.candidatePhone,
  ).catch((err) => console.error('[sales] Close-Notiz fehlgeschlagen:', err));

  if (!isBeratung) return true;

  const videos = parseKundenVideos(process.env.SALES_KUNDENVIDEOS);
  if (videos.length === 0) return true;

  const vorname = input.candidateName.split(' ')[0] || 'du';
  await sendWhatsAppMessage(svc, {
    agencyId: input.agencyId,
    conversationId: input.conversationId,
    candidatePhone: input.candidatePhone,
    waAccountId: input.waAccountId,
    payload: {
      to: input.candidatePhone,
      type: 'text',
      text: { body: buildKundenVideosText(vorname, videos) },
    },
    senderType: 'system',
  });
  return true;
}
