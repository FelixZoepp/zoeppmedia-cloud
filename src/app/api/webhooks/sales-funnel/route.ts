import { NextRequest, NextResponse } from 'next/server';
import { secretGleich } from '@/lib/security/webhook-secret';
import { createAdminClient } from '@/lib/supabase/admin';
import { leseFunnelLead, salesFunnelWebhookToken, uebernehmeFunnelLead } from '@/lib/sales/funnel-lead';

/**
 * Eigene Vertriebs-Funnels (Perspective) → Lead in Close.
 * URL: /api/webhooks/sales-funnel?token=<Token> (steht unter Admin → Anbindung).
 * Der Rohdaten-Payload landet zusätzlich in events_inbox (source 'sales_funnel') zur Nachverfolgung.
 */
export async function POST(request: NextRequest) {
  const expected = salesFunnelWebhookToken();
  if (!expected) return NextResponse.json({ error: 'Nicht eingerichtet' }, { status: 503 });
  if (!secretGleich(request.nextUrl.searchParams.get('token'), expected)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }

  const lead = leseFunnelLead(body, request.nextUrl.searchParams);
  const svc = createAdminClient();
  const protokoll = async (status: string, error: string | null) => {
    const { error: e } = await svc.from('events_inbox').insert({
      source: 'sales_funnel',
      external_id: typeof body.id === 'string' && body.id ? `perspective:${body.id}` : null,
      payload: body,
      status,
      error,
      processed_at: new Date().toISOString(),
    });
    if (e && e.code !== '23505') console.error('[sales-funnel] Protokoll fehlgeschlagen:', e.message);
  };

  if (!lead.email && !lead.phone) {
    await protokoll('failed', 'Keine E-Mail und keine Telefonnummer im Payload');
    return NextResponse.json({ error: 'E-Mail oder Telefonnummer erforderlich' }, { status: 400 });
  }

  try {
    const ergebnis = await uebernehmeFunnelLead(lead);
    await protokoll('done', null);
    return NextResponse.json({ ok: true, lead_id: ergebnis.leadId, neu: ergebnis.neu });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Fehler';
    console.error('[sales-funnel]', msg);
    await protokoll('failed', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
