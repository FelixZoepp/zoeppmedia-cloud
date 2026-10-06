import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeAnbindung } from '@/lib/anbindung/status';

/** GET /api/admin/anbindung – Bewerber-Anbindung aller Kunden (Meta/Funnel, Indeed, Werbekonto, WhatsApp) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  try {
    return NextResponse.json({ kunden: await ladeAnbindung(createAdminClient()), metaSync: !!process.env.META_SYSTEM_USER_TOKEN });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
