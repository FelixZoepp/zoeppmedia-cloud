import type { CurrentUser } from '@/lib/auth';
import { normalizePhoneE164 } from '@/lib/phone';
import { createAdminClient } from '@/lib/supabase/admin';
import { oeffentlicheBasis } from '@/lib/twilio/config';
import { twimlSagen, twimlWaehlen } from '@/lib/twilio/twiml';
import { darfBewerberAnrufen, leseTwilioWebhook, telefonieGrund, xml } from '@/lib/twilio/zugriff';

/**
 * Voice-URL der TwiML-App: der Browser startet einen Anruf mit { candidateId, aufnahme }.
 * Die Zielnummer kommt nur aus der Datenbank – nie aus dem Browser (sonst könnte jemand beliebige Nummern anrufen).
 */
export async function POST(req: Request) {
  const w = await leseTwilioWebhook(req);
  if (!w) return new Response('Forbidden', { status: 403 });
  const { cfg, p } = w;
  const svc = createAdminClient();

  const userId = (p.From ?? '').replace(/^client:/, '');
  const { data: u } = await svc.from('users').select('id, role, agency_id').eq('id', userId).maybeSingle();
  const user = u as Pick<CurrentUser, 'id' | 'role' | 'agency_id'> | null;
  const grund = await telefonieGrund(svc, user);
  if (grund || !user) return xml(twimlSagen(grund ?? 'Anruf nicht möglich.'));

  const { data: c } = await svc
    .from('candidates')
    .select('id, agency_id, phone, blacklisted, deleted_at, do_not_contact')
    .eq('id', p.candidateId ?? '')
    .maybeSingle();
  const cand = c as { id: string; agency_id: string; phone: string | null; blacklisted: boolean | null; deleted_at: string | null; do_not_contact: boolean | null } | null;
  if (!cand) return xml(twimlSagen('Bewerber nicht gefunden.'));
  const nein = darfBewerberAnrufen(user, cand);
  if (nein) return xml(twimlSagen(nein));

  const { data: a } = await svc.from('agencies').select('outbound_phone').eq('id', cand.agency_id).maybeSingle();
  const von = normalizePhoneE164((a as { outbound_phone: string | null } | null)?.outbound_phone) ?? normalizePhoneE164(cfg.callerId);
  if (!von) return xml(twimlSagen('Für diesen Kunden ist noch keine Absendernummer eingetragen.'));

  const nach = normalizePhoneE164(cand.phone)!;
  const aufnahme = p.aufnahme === '1';
  const { data: anruf, error } = await svc
    .from('twilio_anrufe')
    .insert({ agency_id: cand.agency_id, candidate_id: cand.id, user_id: user.id, call_sid: p.CallSid ?? null, nach, von, aufnahme })
    .select('id')
    .single();
  if (error || !anruf) return xml(twimlSagen('Anruf konnte nicht gestartet werden.'));

  return xml(twimlWaehlen({ nummer: nach, callerId: von, basis: oeffentlicheBasis(), anrufId: anruf.id, aufnahme }));
}
