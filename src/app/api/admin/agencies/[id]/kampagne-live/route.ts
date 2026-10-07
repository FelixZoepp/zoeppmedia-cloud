import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { kampagneLive } from '@/lib/fulfillment/kampagne-live';
import { bausteineBereinigen } from '@/lib/fulfillment/pakete';
import { logActivity } from '@/lib/activity/log';

type Ctx = { params: Promise<{ id: string }> };

/** POST { folgt: Baustein[] } – Kampagne ist live, die genannten Bausteine folgen noch (Admin oder Sync-Token) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const svc = createAdminClient();
  let userId: string | null = null;
  const token = req.headers.get('x-sync-token');
  let ok = false;
  if (token) {
    const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'sync_token').maybeSingle();
    ok = (data as { wert: string } | null)?.wert === token;
  }
  if (!ok) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
    userId = user.id;
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { folgt?: unknown };
  const folgt = Array.isArray(body.folgt) && body.folgt.length ? bausteineBereinigen(body.folgt) ?? [] : [];
  try {
    const ergebnis = await kampagneLive(svc, id, folgt, { userId });
    await logActivity(svc, {
      agency_id: id,
      user_id: userId,
      action: `Kampagne live${folgt.length ? ` – folgt noch: ${folgt.join(', ')}` : ''}`,
      action_type: 'leistungen',
      metadata: { folgt, ...ergebnis },
    }).catch(() => {});
    return NextResponse.json(ergebnis);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 400 });
  }
}
