import { createAdminClient } from '@/lib/supabase/admin';
import { codeEmpfangOffen, extrahiereCode } from '@/lib/twilio/nummer';
import { leseNummerWebhook } from '@/lib/twilio/nummer-server';
import { twimlAntwort } from '@/lib/twilio/twiml';
import { xml } from '@/lib/twilio/zugriff';

/**
 * SMS-URL der Kundennummern (WhatsApp): Bestätigungscode von Meta speichern – nur im Code-Fenster.
 * Es wird NIE geantwortet (leere TwiML-Antwort).
 */
export async function POST(req: Request) {
  const svc = createAdminClient();
  const w = await leseNummerWebhook(req, svc);
  if (!w) return new Response('Forbidden', { status: 403 });
  const { p, eintrag } = w;

  const text = (p.Body ?? '').trim();
  if (text && codeEmpfangOffen(eintrag.code_empfang_bis)) {
    const { error } = await svc.from('nummer_codes').insert({ agency_id: eintrag.agency_id, nummer: eintrag.nummer_e164 ?? p.To, art: 'sms', text: text.slice(0, 1000), code: extrahiereCode(text) });
    if (error) console.error('[twilio] SMS-Code speichern:', error.message);
  }
  return xml(twimlAntwort());
}
