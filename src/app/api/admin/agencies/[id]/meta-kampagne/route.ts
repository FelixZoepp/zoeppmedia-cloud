import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { aktiviereKampagne, ladeKampagne, legeKampagneAn, pruefeVoraussetzungen } from '@/lib/meta/kampagne';

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** GET – Stand der Meta-Kampagne, Voraussetzungen, Autostart-Einstellung */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  const [kampagne, voraussetzungen, { data: agency }, { data: ads }] = await Promise.all([
    ladeKampagne(svc, id),
    pruefeVoraussetzungen(svc, id),
    svc.from('agencies').select('settings').eq('id', id).maybeSingle(),
    svc.from('ad_items').select('id, titel, stage, meta_ad_id, meta_fehler').eq('agency_id', id).in('stage', ['bereit', 'live']),
  ]);
  const settings = ((agency as { settings: Record<string, unknown> | null } | null)?.settings ?? {}) as Record<string, unknown>;
  return NextResponse.json({ kampagne, voraussetzungen, autostart: settings.kampagne_autostart === true, ads: ads ?? [] });
}

/**
 * POST { aktion }
 *  - 'anlegen'   → Kampagne/Anzeigen pausiert anlegen bzw. vervollständigen
 *  - 'starten'   → alles auf ACTIVE (ab hier fließt Werbebudget)
 *  - 'autostart' → { wert: boolean } Autostart nach erfolgreichem Test-Lead an/aus
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { aktion?: string; wert?: boolean };
  const svc = createAdminClient();

  if (body.aktion === 'autostart') {
    const { data } = await svc.from('agencies').select('settings').eq('id', id).maybeSingle();
    const settings = { ...(((data as { settings: Record<string, unknown> | null } | null)?.settings) ?? {}), kampagne_autostart: body.wert === true };
    const { error } = await svc.from('agencies').update({ settings }).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ autostart: settings.kampagne_autostart });
  }

  if (!process.env.META_SYSTEM_USER_TOKEN) return NextResponse.json({ error: 'META_SYSTEM_USER_TOKEN ist nicht gesetzt' }, { status: 503 });

  if (body.aktion === 'anlegen') {
    const r = await legeKampagneAn(svc, id, { userId: user.id });
    return NextResponse.json(r, { status: r.ok || r.fehlt ? 200 : 502 });
  }
  if (body.aktion === 'starten') {
    const r = await aktiviereKampagne(svc, id, { userId: user.id, quelle: 'knopf' });
    return NextResponse.json(r, { status: r.ok ? 200 : 502 });
  }
  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
}
