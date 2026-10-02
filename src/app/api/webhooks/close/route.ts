import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { CLOSE_STATUS_SETTING_NO_SHOW, closeWebhookToken } from '@/lib/sales/close';
import { handleCloseSettingNoShow } from '@/lib/sales/noshow';
import { syncFollowupForOpportunity } from '@/lib/sales/followup';

/**
 * Close-Webhook (Sales-Bot). Abo: opportunity.created / opportunity.updated.
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
