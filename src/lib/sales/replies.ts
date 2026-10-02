/**
 * Sales-Kette: eingehende WhatsApp-Antworten von Prospects auswerten.
 *
 * "Ja, ich bin dabei" (Quick-Reply aus setting_/beratung_bestaetigung) →
 *   Bestätigung im Aktivitätslog + Close-Notiz + Benachrichtigung an Felix.
 *   Bei der Beratung zusätzlich die versprochenen Kundenerfahrungen (Videos)
 *   als Freitext senden — das 24h-Fenster ist durch die Antwort gerade offen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';
import { addCloseNoteByEmail } from './close';

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

export async function handleSalesReply(svc: SupabaseClient, input: SalesReplyInput): Promise<void> {
  if (!isConfirmationReply(input.text)) return;

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

  if (!evt) return;
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
  if (already) return;

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

  await createNotificationForInternals(svc, {
    agency_id: input.agencyId,
    title: `Sales: ${input.candidateName} hat bestätigt`,
    body: `${label} am ${wann} ist per WhatsApp bestätigt.`,
    type: 'system',
    push_url: `/api/admin/sales-inbox?conversation=${input.conversationId}`,
  }).catch(() => {});

  await addCloseNoteByEmail(
    event.invitee_email,
    `WhatsApp: ${label} am ${wann} vom Kunden bestätigt ("${input.text.trim()}").`,
  ).catch((err) => console.error('[sales] Close-Notiz fehlgeschlagen:', err));

  if (!isBeratung) return;

  const videos = parseKundenVideos(process.env.SALES_KUNDENVIDEOS);
  if (videos.length === 0) return;

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
}
