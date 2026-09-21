import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN;

function verifySignature(rawBody: string, sigHeader: string | null, appSecret: string): boolean {
  if (!sigHeader || !sigHeader.startsWith('sha256=')) return false;
  const received = sigHeader.slice('sha256='.length);
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const receivedBuf = Buffer.from(received);
  const expectedBuf = Buffer.from(expected);
  return receivedBuf.length === expectedBuf.length && timingSafeEqual(receivedBuf, expectedBuf);
}

// Meta webhook verification (hub.challenge)
export async function GET(request: NextRequest) {
  const mode = request.nextUrl.searchParams.get('hub.mode');
  const token = request.nextUrl.searchParams.get('hub.verify_token');
  const challenge = request.nextUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && VERIFY_TOKEN && token === VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: 'Verification failed' }, { status: 403 });
}

// Receive WhatsApp events: messages, statuses, template updates
export async function POST(request: NextRequest) {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) {
    // Degraded mode — webhook nicht konfiguriert
    return NextResponse.json({ error: 'Webhook nicht konfiguriert' }, { status: 500 });
  }

  const rawBody = await request.text();

  if (!verifySignature(rawBody, request.headers.get('x-hub-signature-256'), appSecret)) {
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 });
  }

  // Sofort 200 antworten — Verarbeitung passiert asynchron über events_inbox.
  // Wir parsen und schreiben in die Queue, aber kehren in <2s zurück.
  const body = JSON.parse(rawBody);
  const supabase = createAdminClient();

  const entries = body?.entry || [];
  for (const entry of entries) {
    const changes = entry?.changes || [];
    for (const change of changes) {
      if (change.field !== 'messages') continue;

      const value = change.value || {};
      const phoneNumberId = value.metadata?.phone_number_id;

      // Agency über phone_number_id -> whatsapp_accounts auflösen
      let agencyId: string | null = null;
      if (phoneNumberId) {
        const { data: waAccount } = await supabase
          .from('whatsapp_accounts')
          .select('agency_id')
          .eq('phone_number_id', phoneNumberId)
          .maybeSingle();
        agencyId = waAccount?.agency_id || null;
      }

      // Eingehende Nachrichten
      const messages = value.messages || [];
      for (const msg of messages) {
        await supabase.from('events_inbox').insert({
          source: 'whatsapp',
          external_id: msg.id || null,
          agency_id: agencyId,
          payload: { type: 'whatsapp.inbound', phone_number_id: phoneNumberId, message: msg, contacts: value.contacts },
          status: 'pending',
        });
      }

      // Status-Updates (sent, delivered, read, failed)
      const statuses = value.statuses || [];
      for (const status of statuses) {
        await supabase.from('events_inbox').insert({
          source: 'whatsapp',
          external_id: `status_${status.id}_${status.status}`,
          agency_id: agencyId,
          payload: { type: 'whatsapp.status', phone_number_id: phoneNumberId, status },
          status: 'pending',
        });
      }
    }

    // Template-Status-Updates (separates change.field)
    const templateChanges = (entry?.changes || []).filter(
      (c: Record<string, unknown>) => c.field === 'message_template_status_update'
    );
    for (const tc of templateChanges) {
      await supabase.from('events_inbox').insert({
        source: 'whatsapp',
        external_id: `tmpl_${tc.value?.message_template_id}_${tc.value?.event}`,
        agency_id: null,
        payload: { type: 'whatsapp.template_status', ...tc.value },
        status: 'pending',
      });
    }
  }

  return NextResponse.json({ success: true });
}
