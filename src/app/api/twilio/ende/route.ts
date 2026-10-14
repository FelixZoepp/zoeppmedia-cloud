import { createAdminClient } from '@/lib/supabase/admin';
import { twimlAntwort } from '@/lib/twilio/twiml';
import { leseTwilioWebhook, xml } from '@/lib/twilio/zugriff';

/** Dial-action: Anruf vorbei → Status und Gesprächsdauer merken */
export async function POST(req: Request) {
  const w = await leseTwilioWebhook(req);
  if (!w) return new Response('Forbidden', { status: 403 });
  const id = w.url.searchParams.get('anruf');
  if (id) {
    const dauer = Number(w.p.DialCallDuration);
    await createAdminClient()
      .from('twilio_anrufe')
      .update({ status: w.p.DialCallStatus || 'beendet', dauer_sekunden: Number.isFinite(dauer) ? dauer : null, beendet_am: new Date().toISOString() })
      .eq('id', id);
  }
  return xml(twimlAntwort('<Hangup/>'));
}
