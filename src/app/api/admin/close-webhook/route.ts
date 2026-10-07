import { NextRequest, NextResponse } from 'next/server';
import { closeWebhookToken, ensureCloseWebhook, ensureFollowupField } from '@/lib/sales/close';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Richtet den Close-Webhook und das Opportunity-Feld "Follow-up-Rhythmus" für den Sales-Bot ein (idempotent).
 * Auth wie die Cron-Routen (Authorization: Bearer <CRON_SECRET>) oder interner Sync-Token (x-sync-token).
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  let ok = !!cronSecret && request.headers.get('authorization') === `Bearer ${cronSecret}`;
  const sync = request.headers.get('x-sync-token');
  if (!ok && sync) {
    const { data } = await createAdminClient().from('system_einstellungen').select('wert').eq('key', 'sync_token').maybeSingle();
    ok = (data as { wert: string } | null)?.wert === sync;
  }
  if (!ok) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const token = closeWebhookToken();
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || new URL(request.url).origin;
  const url = `${base}/api/webhooks/close?token=${token}`;

  try {
    const webhook = await ensureCloseWebhook(url);
    const field = await ensureFollowupField();
    return NextResponse.json({ ok: true, webhook, field });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
