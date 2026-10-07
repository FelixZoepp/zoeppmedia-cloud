/**
 * Was macht ein Lead mit seiner Terminbestätigung? Kalender-Button (Terminseite), Kalender-Eintrag
 * (Google/Apple/Outlook) und Ablauf-Video – pro Person erfasst, je Aktion und Termin nur einmal.
 * Landet im Verlauf des Leads in der Cloud und als Notiz am Lead in Close.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/activity/log';
import { SALES_AGENCY_ID } from './calendly-chain';
import { addCloseNoteByEmail } from './close';
import { isPreviewBot } from './tracking';

export type TerminAktion = 'seite' | 'google' | 'apple' | 'outlook' | 'video';

export const AKTION_TEXT: Record<TerminAktion, string> = {
  seite: 'hat die Terminseite geöffnet (Button „Zum Kalender hinzufügen“)',
  google: 'hat den Termin in den Google Kalender eingetragen',
  apple: 'hat den Termin in den Apple/iPhone-Kalender geladen',
  outlook: 'hat den Termin in Outlook eingetragen',
  video: 'hat das Video „So läuft das Gespräch ab“ gestartet',
};

export function istAktion(v: unknown): v is TerminAktion {
  return typeof v === 'string' && v in AKTION_TEXT;
}

/** Erfassen – Fehler dürfen die Seite des Leads nie stören. Gibt zurück, ob neu erfasst wurde. */
export async function erfasseTerminAktion(
  svc: SupabaseClient,
  eventId: string,
  aktion: TerminAktion,
  userAgent: string | null,
  now: Date = new Date(),
): Promise<boolean> {
  if (isPreviewBot(userAgent)) return false;
  try {
    const { data: ev } = await svc
      .from('calendly_events')
      .select('candidate_id, invitee_email, invitee_phone')
      .eq('agency_id', SALES_AGENCY_ID)
      .eq('calendly_event_id', eventId)
      .maybeSingle();
    const e = ev as { candidate_id: string | null; invitee_email: string | null; invitee_phone: string | null } | null;
    if (!e) return false;

    // Nur einmal je Termin und Aktion (Seite mehrmals öffnen = ein Eintrag)
    const { data: schon } = await svc
      .from('activity_log')
      .select('id')
      .eq('agency_id', SALES_AGENCY_ID)
      .eq('metadata->>kind', 'termin_aktion')
      .eq('metadata->>event', eventId)
      .eq('metadata->>aktion', aktion)
      .limit(1)
      .maybeSingle();
    if (schon) return false;

    const zeit = now.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
    await logActivity(svc, {
      agency_id: SALES_AGENCY_ID,
      candidate_id: e.candidate_id,
      action: `${AKTION_TEXT[aktion].replace(/^hat /, 'Hat ')} (${zeit} Uhr)`,
      action_type: 'other',
      metadata: { kind: 'termin_aktion', event: eventId, aktion },
    });
    await addCloseNoteByEmail(e.invitee_email, `👀 WhatsApp-Termin: ${AKTION_TEXT[aktion]} (${zeit} Uhr).`, e.invitee_phone).catch((err) =>
      console.error('[sales] Close-Notiz (Termin-Aktion) fehlgeschlagen:', err),
    );
    return true;
  } catch (err) {
    console.error('[sales] Termin-Aktion nicht erfasst:', err);
    return false;
  }
}
