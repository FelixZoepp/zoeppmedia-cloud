import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { CLOSE_STATUS_SETTING_NO_SHOW, closeWebhookToken } from '@/lib/sales/close';
import { handleCloseSettingNoShow } from '@/lib/sales/noshow';

/**
 * Close-Webhook (Sales-Bot). Abo: opportunity.updated.
 * Reagiert nur auf den Wechsel einer Opportunity auf "Setting - No Show".
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

  if (!isNoShow) return NextResponse.json({ ok: true, action: 'ignored' });

  const leadId = ev?.lead_id ?? ev?.data?.lead_id;
  if (!leadId || !ev?.object_id) return NextResponse.json({ ok: true, action: 'ignored', reason: 'no lead' });

  try {
    const result = await handleCloseSettingNoShow(createAdminClient(), { opportunityId: ev.object_id, leadId });
    return NextResponse.json({ ok: true, action: 'noshow', result });
  } catch (err) {
    console.error('[close-webhook] No-Show fehlgeschlagen:', err);
    return NextResponse.json({ error: 'No-Show-Verarbeitung fehlgeschlagen' }, { status: 500 });
  }
}
