/**
 * Freie Textnachricht des KI-Agenten senden – liegt sie außerhalb der Gesprächszeiten, wird sie als Job
 * (bot.textnachricht) auf den nächsten erlaubten Zeitpunkt gelegt. Gesperrter Bewerber-Kontakt: nichts senden.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { QuietHoursError } from '@/lib/whatsapp/window';

export interface TextJob {
  conversationId: string;
  telefon: string;
  waAccountId: string;
  text: string;
}

export async function sendeOderPlane(svc: SupabaseClient, p: TextJob & { agencyId: string }): Promise<'gesendet' | 'geplant' | 'gesperrt'> {
  try {
    await sendWhatsAppMessage(svc, {
      agencyId: p.agencyId,
      conversationId: p.conversationId,
      candidatePhone: p.telefon,
      waAccountId: p.waAccountId,
      payload: { to: p.telefon, type: 'text', text: { body: p.text } },
      senderType: 'bot',
      gespraechsZeiten: true,
    });
    return 'gesendet';
  } catch (err) {
    if (err instanceof QuietHoursError) {
      await svc.from('scheduled_jobs').insert({
        agency_id: p.agencyId,
        type: 'bot.textnachricht',
        run_at: (err.naechsteZeit ?? new Date(Date.now() + 3600_000)).toISOString(),
        payload: { conversationId: p.conversationId, telefon: p.telefon, waAccountId: p.waAccountId, text: p.text },
        status: 'pending',
      });
      return 'geplant';
    }
    if (err instanceof Error && err.name === 'KontaktGesperrtError') return 'gesperrt';
    throw err;
  }
}
