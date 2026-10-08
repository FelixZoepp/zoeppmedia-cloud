import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { CLOSE_STATUS_SETTING_NO_SHOW, closeWebhookToken } from '@/lib/sales/close';
import { handleCloseSettingNoShow } from '@/lib/sales/noshow';
import { syncFollowupForOpportunity } from '@/lib/sales/followup';
import { erfasseEintragung } from '@/lib/sales/eintragungen';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';

/**
 * Close-Webhook (Sales-Bot). Abo: opportunity.created / opportunity.updated / lead.created / activity.custom_activity.
 * - Gesprächsprotokoll → speichern + Automatik (src/lib/sales/protokolle.ts)
 * - Neuer Lead → Eintragung merken, nach 10 Min. prüfen, ob ein Termin gebucht wurde
 * - Wechsel auf "Setting - No Show" → WhatsApp noshow_1_anruf
 * - Status "… - Follow Up" + Feld "Follow-up-Rhythmus" → Follow-up-Kette starten/umplanen/stoppen
 * Auth: geheimer Token in der URL (?token=…, abgeleitet aus CRON_SECRET).
 */

interface CloseWebhookBody {
  event?: {
    object_type?: string;
    action?: string;
    object_id?: string;
    lead_id?: string;
    changed_fields?: string[];
    data?: { status_id?: string; lead_id?: string };
    previous_data?: { status_id?: string };
  };
}

function tokenValid(given: string | null): boolean {
  const expected = closeWebhookToken();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  if (!tokenValid(request.nextUrl.searchParams.get('token'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: CloseWebhookBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const ev = body.event;
  const isNoShow =
    ev?.object_type === 'opportunity' &&
    ev.action === 'updated' &&
    (ev.changed_fields ?? []).includes('status_id') &&
    ev.data?.status_id === CLOSE_STATUS_SETTING_NO_SHOW &&
    ev.previous_data?.status_id !== CLOSE_STATUS_SETTING_NO_SHOW;

  if (ev?.object_type === 'lead' && ev.action === 'created' && ev.object_id) {
    try {
      return NextResponse.json({ ok: true, eintragung: await erfasseEintragung(createAdminClient(), ev.object_id) });
    } catch (err) {
      console.error('[close-webhook] Eintragung fehlgeschlagen:', err);
      return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen' }, { status: 500 });
    }
  }
  // Gesprächsprotokoll (Custom Activity) → Job: speichern + Automatik (Sperre, Status, Opportunity)
  if (ev?.object_type === 'activity.custom_activity' && (ev.action === 'created' || ev.action === 'updated') && ev.object_id) {
    const { error } = await createAdminClient().from('scheduled_jobs').insert({
      agency_id: SALES_AGENCY_ID,
      type: 'sales.protokoll',
      run_at: new Date().toISOString(),
      payload: { activity_id: ev.object_id },
      status: 'pending',
      // created + updated (Entwurf → veröffentlicht) dürfen beide planen; der Job ist idempotent
      dedupe_key: `sales.protokoll:${ev.object_id}:${ev.action}:${Math.floor(Date.now() / 60_000)}`,
    });
    if (error && error.code !== '23505') {
      console.error('[close-webhook] Protokoll-Job nicht geplant:', error.message);
      return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, protokoll: 'geplant' });
  }
  if (ev?.object_type !== 'opportunity' || !ev.object_id) return NextResponse.json({ ok: true, action: 'ignored' });
  const svc = createAdminClient();
  const result: Record<string, unknown> = {};

  try {
    if (isNoShow) {
      const leadId = ev.lead_id ?? ev.data?.lead_id;
      if (leadId) result.noshow = await handleCloseSettingNoShow(svc, { opportunityId: ev.object_id, leadId });
    }
    if (ev.action === 'created' || ev.action === 'updated') {
      result.followup = await syncFollowupForOpportunity(svc, ev.object_id);
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error('[close-webhook] Verarbeitung fehlgeschlagen:', err);
    return NextResponse.json({ error: 'Verarbeitung fehlgeschlagen' }, { status: 500 });
  }
}
