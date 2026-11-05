import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { pruefeLisaSignatur } from '@/lib/lisa/protokoll';
import { lisaWebhookSecret } from '@/lib/lisa/verbindung';

/**
 * Hiring Lisa → Cloud: Rückmeldungen (Anruf, Status, Termine) und WhatsApp-Anlässe.
 * URL je Kunde: /api/webhooks/lisa?agency=<id> – in Lisa unter Einstellungen → Integrationen als
 * „Rückmeldung (Webhook)“ und „WhatsApp über bestehendes System“ eintragen.
 * Signatur: Lisa-Signature (HMAC wie Stripe). Entdoppeln über Lisa-Delivery in events_inbox;
 * die Verarbeitung macht der Minuten-Takt (Typ lisa.ereignis) – hier nur schnell annehmen.
 */
export async function POST(request: NextRequest) {
  const agencyId = request.nextUrl.searchParams.get('agency');
  if (!agencyId || !isUuid(agencyId)) return NextResponse.json({ error: 'agency fehlt' }, { status: 400 });

  const rawBody = await request.text();
  if (rawBody.length > 200_000) return NextResponse.json({ error: 'zu groß' }, { status: 413 });
  const svc = createAdminClient();
  const secret = await lisaWebhookSecret(svc, agencyId);
  if (!secret || !pruefeLisaSignatur(secret, rawBody, request.headers.get('lisa-signature'))) {
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }
  const delivery = request.headers.get('lisa-delivery') ?? (typeof event.id === 'string' ? event.id : null);
  const typ = (typeof event.type === 'string' ? event.type : null) ?? request.headers.get('lisa-event') ?? 'unbekannt';

  const { error } = await svc.from('events_inbox').insert({
    source: 'lisa',
    external_id: delivery ? `${agencyId}:${delivery}` : null,
    agency_id: agencyId,
    payload: { type: 'lisa.ereignis', lisa_type: typ, event },
    status: 'pending',
  });
  if (error?.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  return NextResponse.json({ ok: true });
}
