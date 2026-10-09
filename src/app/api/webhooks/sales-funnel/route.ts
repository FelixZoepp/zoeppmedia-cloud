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
  const externalId = typeof body.id === 'string' && body.id ? `perspective:${body.id}` : null;

  if (!lead.email && !lead.phone) {
    await svc.from('events_inbox').insert({ source: 'sales_funnel', external_id: null, payload: body, status: 'failed', error: 'Keine E-Mail und keine Telefonnummer im Payload', processed_at: new Date().toISOString() });
    return NextResponse.json({ error: 'E-Mail oder Telefonnummer erforderlich' }, { status: 400 });
  }

  // Eintrag ZUERST beanspruchen: schickt Perspective dieselbe Eintragung nochmal, entsteht kein zweiter Lead
  // (Status 'done' als Platzhalter – der Minuten-Tick verarbeitet diese Quelle nicht)
  const { data: claim, error: claimErr } = await svc
    .from('events_inbox')
    .insert({ source: 'sales_funnel', external_id: externalId, payload: body, status: 'done', error: 'in Bearbeitung', processed_at: new Date().toISOString() })
    .select('id')
    .single();
  if (claimErr?.code === '23505') return NextResponse.json({ ok: true, duplicate: true });
  if (claimErr) console.error('[sales-funnel] Protokoll fehlgeschlagen:', claimErr.message);
  const claimId = (claim as { id: string } | null)?.id ?? null;

  try {
    const ergebnis = await uebernehmeFunnelLead(lead);
    if (claimId) await svc.from('events_inbox').update({ error: null, processed_at: new Date().toISOString() }).eq('id', claimId);
    return NextResponse.json({ ok: true, lead_id: ergebnis.leadId, neu: ergebnis.neu });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Fehler';
    console.error('[sales-funnel]', msg);
    // Freigeben, damit ein erneuter Versuch von Perspective die Eintragung übernehmen kann
    if (claimId) await svc.from('events_inbox').delete().eq('id', claimId);
    await svc.from('events_inbox').insert({ source: 'sales_funnel', external_id: null, payload: body, status: 'failed', error: msg, processed_at: new Date().toISOString() });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
