import { after } from 'next/server';
import { logActivity } from '@/lib/activity/log';
import { AUFNAHME_BUCKET } from '@/lib/recordings/pfad';
import { verarbeiteAufnahme } from '@/lib/recordings/verarbeiten';
import { createAdminClient } from '@/lib/supabase/admin';
import type { TwilioConfig } from '@/lib/twilio/config';
import { leseTwilioWebhook } from '@/lib/twilio/zugriff';

export const maxDuration = 300;

/**
 * Aufnahme fertig → MP3 von Twilio holen, privat speichern, als Gesprächsaufnahme anlegen,
 * transkribieren + auswerten, danach bei Twilio löschen (liegt dann nur noch bei uns).
 */
export async function POST(req: Request) {
  const w = await leseTwilioWebhook(req);
  if (!w) return new Response('Forbidden', { status: 403 });
  const id = w.url.searchParams.get('anruf');
  const { RecordingSid: sid, RecordingUrl: rurl, RecordingStatus: status, RecordingDuration: dauer } = w.p;
  if (id && sid && rurl && status === 'completed') after(() => uebernehmen(w.cfg, id, sid, rurl, Number(dauer) || null).catch((e) => console.error('[twilio] Aufnahme:', e)));
  return new Response(null, { status: 204 });
}

async function uebernehmen(cfg: TwilioConfig, anrufId: string, sid: string, rurl: string, dauer: number | null) {
  const svc = createAdminClient();
  const { data } = await svc.from('twilio_anrufe').select('id, agency_id, candidate_id, user_id, recording_id').eq('id', anrufId).maybeSingle();
  const anruf = data as { id: string; agency_id: string; candidate_id: string | null; user_id: string | null; recording_id: string | null } | null;
  if (!anruf || anruf.recording_id || !anruf.candidate_id || !anruf.user_id) return;

  const auth = `Basic ${Buffer.from(`${cfg.accountSid}:${cfg.authToken}`).toString('base64')}`;
  if (new URL(rurl).hostname !== 'api.twilio.com') throw new Error('Unerwartete Aufnahme-URL');
  const res = await fetch(`${rurl}.mp3`, { headers: { Authorization: auth } });
  if (!res.ok) throw new Error(`Download ${res.status}`);
  const buffer = Buffer.from(await res.arrayBuffer());

  const pfad = `${anruf.agency_id}/twilio-${anruf.id}.mp3`;
  const { error: upErr } = await svc.storage.from(AUFNAHME_BUCKET).upload(pfad, buffer, { contentType: 'audio/mpeg', upsert: true });
  if (upErr) throw new Error(upErr.message);

  const { data: rec, error } = await svc
    .from('call_recordings')
    .insert({
      candidate_id: anruf.candidate_id,
      agency_id: anruf.agency_id,
      uploaded_by: anruf.user_id,
      recording_type: 'erstgespraech',
      file_url: pfad,
      file_name: `Anruf ${new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })}.mp3`,
      file_size_bytes: buffer.length,
      duration_seconds: dauer,
      transcript_status: 'processing',
      twilio_anruf_id: anruf.id,
    })
    .select('id')
    .single();
  if (error || !rec) throw new Error(error?.message ?? 'Aufnahme nicht angelegt');
  await svc.from('twilio_anrufe').update({ recording_id: rec.id }).eq('id', anruf.id);

  await logActivity(svc, {
    agency_id: anruf.agency_id,
    user_id: anruf.user_id,
    candidate_id: anruf.candidate_id,
    action: 'Anruf über die Cloud aufgezeichnet',
    action_type: 'recording_upload',
    metadata: { twilio_anruf_id: anruf.id, dauer_sekunden: dauer },
  });

  // Bei Twilio löschen – erst nachdem sie sicher bei uns liegt
  await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.accountSid}/Recordings/${sid}.json`, { method: 'DELETE', headers: { Authorization: auth } }).catch(() => {});

  await verarbeiteAufnahme(svc, rec.id, buffer, 'anruf.mp3', anruf.agency_id, 'erstgespraech');
}
