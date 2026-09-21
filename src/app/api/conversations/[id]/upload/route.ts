/**
 * POST /api/conversations/[id]/upload
 *
 * Datei-Upload (Bild/Dokument) via WhatsApp.
 * Lädt in Supabase Storage, ruft provider.uploadMedia(), sendet via sendWhatsAppMessage.
 * Phase 3 Task 11.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { getProvider } from '@/lib/whatsapp/provider';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { decryptSecret } from '@/lib/crypto';
import { randomUUID } from 'crypto';

const MAX_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'application/pdf']);
const BUCKET = 'whatsapp-media';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  // FormData parsen
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const file = formData.get('file');
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  // MIME-Validierung
  if (!ALLOWED_MIMES.has(file.type)) {
    return NextResponse.json({ error: 'Dateityp nicht erlaubt' }, { status: 400 });
  }

  // Größen-Validierung
  if (file.size > MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Datei zu groß (max. 10 MB)' }, { status: 400 });
  }

  const svc = createAdminClient();

  // Conversation laden (mit Tenant-Prüfung)
  const { data: conv } = await svc
    .from('conversations')
    .select('id, wa_account_id, candidate_id')
    .eq('id', conversationId)
    .eq('agency_id', agencyId)
    .single();

  if (!conv) return NextResponse.json({ error: 'Konversation nicht gefunden' }, { status: 404 });

  const convTyped = conv as { id: string; wa_account_id: string; candidate_id: string };

  // WhatsApp-Account laden (agency-scoped)
  const { data: waAccount } = await svc
    .from('whatsapp_accounts')
    .select('phone_number_id, access_token_enc')
    .eq('id', convTyped.wa_account_id)
    .eq('agency_id', agencyId)
    .single();

  if (!waAccount) {
    return NextResponse.json({ error: 'WhatsApp-Konto nicht gefunden' }, { status: 400 });
  }

  const waAccountTyped = waAccount as { phone_number_id: string; access_token_enc: string };

  // Kandidaten-Telefon laden (agency-scoped)
  const { data: candidate } = await svc
    .from('candidates')
    .select('phone_e164')
    .eq('id', convTyped.candidate_id)
    .eq('agency_id', agencyId)
    .single();

  if (!candidate?.phone_e164) {
    return NextResponse.json({ error: 'Telefonnummer nicht vorhanden' }, { status: 400 });
  }

  const candidateTyped = candidate as { phone_e164: string };

  // Datei in Buffer einlesen
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // In Supabase Storage hochladen
  const filename = file.name;
  const storagePath = `${agencyId}/${conversationId}/${randomUUID()}-${filename}`;
  const { error: storageError } = await svc.storage
    .from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (storageError) {
    return NextResponse.json(
      { error: 'Speichern fehlgeschlagen' },
      { status: 500 },
    );
  }

  // Token entschlüsseln
  const token = decryptSecret(waAccountTyped.access_token_enc);

  // Media bei WhatsApp hochladen
  const provider = getProvider();
  const { mediaId } = await provider.uploadMedia(
    waAccountTyped.phone_number_id,
    token,
    buffer,
    file.type,
    filename,
  );

  // Payload bestimmen (image vs. document)
  const isImage = file.type === 'image/jpeg' || file.type === 'image/png';
  const payload = isImage
    ? ({
        to: candidateTyped.phone_e164,
        type: 'image' as const,
        image: { id: mediaId },
      })
    : ({
        to: candidateTyped.phone_e164,
        type: 'document' as const,
        document: { id: mediaId, filename },
      });

  // Via sendWhatsAppMessage senden (R4-Muster: Wurf → 400)
  try {
    const result = await sendWhatsAppMessage(svc, {
      agencyId,
      conversationId,
      candidatePhone: candidateTyped.phone_e164,
      waAccountId: convTyped.wa_account_id,
      payload,
      senderType: 'user',
      userId: user.id,
      isHumanUiSend: true,
    });

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Senden fehlgeschlagen' },
      { status: 400 },
    );
  }
}
