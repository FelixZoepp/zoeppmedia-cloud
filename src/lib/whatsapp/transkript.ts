import type { SupabaseClient } from '@supabase/supabase-js';

/** Sprachnachricht laden und mit Whisper abschreiben (max. ~2 Min. Audio sinnvoll) */
export async function schreibeSprachnachrichtAb(svc: SupabaseClient, waAccountId: string, mediaId: string): Promise<string> {
  const { data } = await svc.from('whatsapp_accounts').select('access_token_enc').eq('id', waAccountId).single();
  const enc = (data as { access_token_enc: string } | null)?.access_token_enc;
  if (!enc) return '';
  const { decryptSecret } = await import('@/lib/crypto');
  const { getProvider } = await import('@/lib/whatsapp/provider');
  const token = decryptSecret(enc);
  const url = await getProvider().getMediaUrl(mediaId, token);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return '';
  // Größe vor dem Laden prüfen (max. 10 MB ≈ mehrere Minuten Sprachnachricht)
  if (Number(res.headers.get('content-length') ?? 0) > 10 * 1024 * 1024) return '';
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 10 * 1024 * 1024) return '';
  const { transcribeAudio } = await import('@/lib/recordings/transcribe');
  return (await transcribeAudio(buf, 'sprachnachricht.ogg')).trim().slice(0, 2000);
}

/**
 * Job sales.sprachnachricht_nachtragen: eine schon gespeicherte Sprachnachricht (Body „[Sprachnachricht]“) nachträglich
 * abschreiben → Inbox-Text ersetzen + Notiz am Close-Lead. Rein intern, an den Lead geht nichts.
 */
export async function trageSprachnachrichtNach(
  svc: SupabaseClient,
  p: { media_id: string; wa_message_id: string; wa_account_id: string; phone: string },
): Promise<string> {
  const transkript = await schreibeSprachnachrichtAb(svc, p.wa_account_id, p.media_id);
  if (!transkript) throw new Error('Sprachnachricht nicht abgeschrieben (leer oder nicht ladbar)');
  await svc.from('messages').update({ body: `🎤 ${transkript}` }).eq('wa_message_id', p.wa_message_id);
  const { addCloseNoteByEmail } = await import('@/lib/sales/close');
  await addCloseNoteByEmail(null, `🎤 WhatsApp-Sprachnachricht (abgeschrieben): „${transkript}“`, p.phone);
  return transkript;
}
