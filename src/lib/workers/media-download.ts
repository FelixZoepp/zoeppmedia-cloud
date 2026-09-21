/**
 * Worker: Medien von Meta herunterladen und in private Storage legen.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { getProvider } from '@/lib/whatsapp/provider';
import { decryptSecret } from '@/lib/crypto';

interface MediaJobPayload {
  media_id: string;
  mime_type: string;
  message_id: string;
  conversation_id: string;
  wa_account_id: string;
}

export async function processMediaDownload(svc: SupabaseClient, agencyId: string, payload: MediaJobPayload) {
  // 1. Token laden (I1: agency_id-Filter verhindert cross-tenant Zugriff)
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('access_token_enc, phone_number_id')
    .eq('id', payload.wa_account_id)
    .eq('agency_id', agencyId)
    .single();

  if (!waAccount) throw new Error('WhatsApp-Account nicht gefunden');

  const token = decryptSecret(waAccount.access_token_enc);
  const provider = getProvider();

  // 2. Media-URL von Meta holen
  const mediaUrl = await provider.getMediaUrl(payload.media_id, token);

  // 3. Datei herunterladen (mit Bearer Token)
  const response = await fetch(mediaUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Media-Download fehlgeschlagen: ${response.status}`);

  const buffer = Buffer.from(await response.arrayBuffer());

  // 4. In Supabase Storage hochladen
  const ext = payload.mime_type.split('/')[1] || 'bin';
  const storagePath = `${agencyId}/whatsapp/${payload.conversation_id}/${payload.media_id}.${ext}`;

  const { error: uploadErr } = await svc.storage
    .from('whatsapp-media')
    .upload(storagePath, buffer, { contentType: payload.mime_type });

  if (uploadErr) throw new Error(`Storage-Upload fehlgeschlagen: ${uploadErr.message}`);

  // 5. Message-Row aktualisieren mit media_path (C2: agency_id-Filter verhindert cross-tenant Zugriff)
  await svc.from('messages')
    .update({ media_path: storagePath })
    .eq('wa_message_id', payload.message_id)
    .eq('agency_id', agencyId);
}
