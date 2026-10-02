import { NextRequest, NextResponse } from 'next/server';
import { closeWebhookToken, ensureCloseWebhook } from '@/lib/sales/close';

/**
 * Richtet den Close-Webhook für den Sales-Bot ein (idempotent).
 * Auth wie die Cron-Routen: Authorization: Bearer <CRON_SECRET>.
 */
export async function POST(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = closeWebhookToken();
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, '') || new URL(request.url).origin;
  const url = `${base}/api/webhooks/close?token=${token}`;

  try {
    const result = await ensureCloseWebhook(url);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
