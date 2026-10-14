import { ANSAGE_TEXT, twimlSagen } from '@/lib/twilio/twiml';
import { leseTwilioWebhook, xml } from '@/lib/twilio/zugriff';

/** Hört der Angerufene beim Abheben, bevor verbunden wird (nur bei Anrufen mit Aufnahme) */
export async function POST(req: Request) {
  if (!(await leseTwilioWebhook(req))) return new Response('Forbidden', { status: 403 });
  return xml(twimlSagen(ANSAGE_TEXT));
}
