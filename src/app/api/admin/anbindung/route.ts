import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeAnbindung } from '@/lib/anbindung/status';

/** GET /api/admin/anbindung – Bewerber-Anbindung aller Kunden (Meta/Funnel, Indeed, Werbekonto, WhatsApp) */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  try {
    // Webhook-Basis für Perspective; ist ein Kennwort gesetzt, gehört es mit in die URL (?secret=)
    const basis = `${req.nextUrl.origin}/api/webhooks/perspective`;
    const perspectiveWebhook =
      user.role === 'admin' && process.env.PERSPECTIVE_WEBHOOK_SECRET
        ? `${basis}?secret=${encodeURIComponent(process.env.PERSPECTIVE_WEBHOOK_SECRET)}`
        : basis;
    return NextResponse.json({ kunden: await ladeAnbindung(createAdminClient()), metaSync: !!process.env.META_SYSTEM_USER_TOKEN, perspectiveWebhook });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
