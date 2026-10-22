import { NextRequest, NextResponse } from 'next/server';
import { secretGleich } from '@/lib/security/webhook-secret';
import { createAdminClient } from '@/lib/supabase/admin';
import { istReportFunnel, reportQuelle, starteReport } from '@/lib/sales/report';
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

  // Eintrag ZUERST beanspruchen (eigene Tabelle, wiederaufnehmbar): dieselbe Eintragung erzeugt nie einen zweiten Lead.
  // Bricht ein Lauf hart ab, darf nach 2 Minuten ein erneuter Versuch übernehmen.
  if (externalId) {
    const { error: claimErr } = await svc.from('sales_funnel_eingaenge').insert({ external_id: externalId });
    if (claimErr?.code === '23505') {
      const zweiMin = new Date(Date.now() - 2 * 60_000).toISOString();
      const { data: uebernommen } = await svc
        .from('sales_funnel_eingaenge')
        .update({ gestartet_am: new Date().toISOString(), fehler: null })
        .eq('external_id', externalId)
        .eq('status', 'laeuft')
        .lt('gestartet_am', zweiMin)
        .select('external_id');
      if (!uebernommen?.length) return NextResponse.json({ ok: true, duplicate: true });
    } else if (claimErr) {
      return NextResponse.json({ error: `Eingang nicht gespeichert: ${claimErr.message}` }, { status: 500 });
    }
  }
  const protokoll = (status: string, error: string | null) =>
    svc.from('events_inbox').insert({ source: 'sales_funnel', external_id: null, payload: body, status, error, processed_at: new Date().toISOString() });

  try {
    const ergebnis = await uebernehmeFunnelLead(lead);
    // Herkunft je Anzeige merken (Auswertung Marketing → Anzeigen)
    if (ergebnis.neu) {
      await svc
        .from('lead_herkunft')
        .upsert(
          { lead_id: ergebnis.leadId, quelle: 'funnel', utm_source: lead.utm.source, utm_medium: lead.utm.medium, utm_campaign: lead.utm.campaign, utm_term: lead.utm.term ?? null, utm_content: lead.utm.content },
          { onConflict: 'lead_id', ignoreDuplicates: true },
        )
        .then(({ error }) => error && console.error('[sales-funnel] Herkunft:', error.message));
    }
    // Report-Funnel: Slack an Felix, WhatsApp mit PDF, 10-Min-Check (sales/report.ts) – scheitert nie den Webhook
    if (istReportFunnel(lead.funnelName)) {
      await starteReport(svc, { leadId: ergebnis.leadId, neu: ergebnis.neu, report: reportQuelle(lead.funnelName), name: lead.name, email: lead.email, phone: lead.phone }).catch((e) =>
        console.error('[sales-funnel] Report-Strecke:', e),
      );
    }
    if (externalId) await svc.from('sales_funnel_eingaenge').update({ status: 'fertig', erledigt_am: new Date().toISOString(), lead_id: ergebnis.leadId }).eq('external_id', externalId);
    // Meta Conversions API: jede Eintragung als „Lead“ (nur mit Freigabe/Testmodus, scheitert nie den Webhook)
    {
      const { klickAusPayload, planeCapiEvent } = await import('@/lib/meta/capi');
      const klick = klickAusPayload(body);
      await planeCapiEvent(svc, {
        name: 'Lead',
        eventId: `lead_${externalId ?? `${ergebnis.leadId}_${klick.konvertiert ?? Date.now()}`}`,
        closeLeadId: ergebnis.leadId,
        zeit: klick.konvertiert ? new Date(klick.konvertiert) : new Date(),
        kontakt: { email: lead.email, phone: lead.phone, name: lead.name, fbclid: klick.fbclid, ersterBesuch: klick.ersterBesuch },
      });
    }
    await protokoll('done', null);
    return NextResponse.json({ ok: true, lead_id: ergebnis.leadId, neu: ergebnis.neu });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Fehler';
    console.error('[sales-funnel]', msg);
    // Freigeben, damit ein erneuter Versuch von Perspective die Eintragung übernehmen kann
    if (externalId) await svc.from('sales_funnel_eingaenge').delete().eq('external_id', externalId).eq('status', 'laeuft');
    await protokoll('failed', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
