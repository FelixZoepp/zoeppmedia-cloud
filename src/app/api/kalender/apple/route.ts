import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { verbindeApple } from '@/lib/kalender/kunden-kalender';

/** POST { apple_id, passwort } – Apple-Kalender (iCloud) mit app-spezifischem Passwort verbinden (Inhaber, Admins, Zoepp-Team) */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Bitte anmelden' }, { status: 401 });
  if (!['agency_owner', 'admin', 'employee'].includes(user.role)) return NextResponse.json({ error: 'Nur der Inhaber kann den Kalender verbinden' }, { status: 403 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { apple_id?: string; passwort?: string };
  const appleId = body.apple_id?.trim() ?? '';
  const passwort = (body.passwort ?? '').replace(/\s+/g, '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(appleId)) return NextResponse.json({ error: 'Bitte deine Apple-ID (E-Mail-Adresse) eintragen.' }, { status: 400 });
  if (!/^[a-z]{4}-?[a-z]{4}-?[a-z]{4}-?[a-z]{4}$/i.test(passwort)) {
    return NextResponse.json({ error: 'Das ist kein app-spezifisches Passwort. Es hat 16 Buchstaben im Format xxxx-xxxx-xxxx-xxxx – dein normales Apple-Passwort funktioniert hier nicht.' }, { status: 400 });
  }

  const svc = createAdminClient();
  try {
    const r = await verbindeApple(svc, agencyId, user.id, appleId, passwort);
    const { signalSafe } = await import('@/lib/fulfillment/engine');
    await signalSafe(svc, agencyId, 'kalender_verbunden');
    await svc.from('audit_log').insert({ actor_id: user.id, agency_id: agencyId, action: 'kalender.verbunden', target: 'apple', data: { kalender: r.kalender } });
    return NextResponse.json({ ok: true, kalender: r.kalender });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Verbindung fehlgeschlagen' }, { status: 400 });
  }
}
