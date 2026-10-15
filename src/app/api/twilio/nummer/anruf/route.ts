import { createAdminClient } from '@/lib/supabase/admin';
import { oeffentlicheBasis } from '@/lib/twilio/config';
import { codeEmpfangOffen, extrahiereCode } from '@/lib/twilio/nummer';
import { leseNummerWebhook } from '@/lib/twilio/nummer-server';
import { twimlAuflegen, twimlCodeHoeren, twimlSagen } from '@/lib/twilio/twiml';
import { xml } from '@/lib/twilio/zugriff';

/**
 * Voice-URL der Kundennummern (WhatsApp): Meta ruft an und liest den Bestätigungscode vor.
 * Nur im Code-Fenster (Admin hat „Auf Code warten“ geklickt) wird mitgehört: erst deutsch, dann englisch.
 * Außerhalb des Fensters: kurze Ansage, auflegen – es wird nichts gespeichert.
 */
export async function POST(req: Request) {
  const svc = createAdminClient();
  const w = await leseNummerWebhook(req, svc);
  if (!w) return new Response('Forbidden', { status: 403 });
  const { p, url, eintrag } = w;

  if (!codeEmpfangOffen(eintrag.code_empfang_bis)) return xml(twimlSagen('Diese Nummer ist zurzeit nicht erreichbar. Auf Wiederhören.'));

  const schritt = url.searchParams.get('schritt');
  const action = (s: string) => `${oeffentlicheBasis()}/api/twilio/nummer/anruf?schritt=${s}`;
  if (!schritt) return xml(twimlCodeHoeren({ action: action('de'), sprache: 'de-DE' }));

  const text = (p.SpeechResult ?? '').trim();
  const code = extrahiereCode(text);
  if (text) {
    const { error } = await svc.from('nummer_codes').insert({ agency_id: eintrag.agency_id, nummer: eintrag.nummer_e164 ?? p.To, art: 'anruf', text: text.slice(0, 1000), code });
    if (error) console.error('[twilio] Code speichern:', error.message);
  }
  // Kein Code verstanden → zweiter Durchgang auf Englisch (Meta wiederholt den Code)
  if (!code && schritt === 'de') return xml(twimlCodeHoeren({ action: action('en'), sprache: 'en-US' }));
  return xml(twimlAuflegen());
}
