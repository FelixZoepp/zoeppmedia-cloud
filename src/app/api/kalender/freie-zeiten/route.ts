import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { belegteZeiten, freieZeiten } from '@/lib/kalender/kunden-kalender';

/** GET ?minuten=60&tage=7[&agency=<id> für Zoepp-Mitarbeiter] – freie Zeiten im Kalender des Kunden */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { darfKundenCloud } = await import('@/lib/kunden-cloud/zugriff');
  const intern = darfKundenCloud(user);
  const agencyId = (intern && req.nextUrl.searchParams.get('agency')) || (await getEffectiveAgencyId());
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  const minuten = Math.min(240, Math.max(15, Number(req.nextUrl.searchParams.get('minuten')) || 60));
  const tage = Math.min(21, Math.max(1, Number(req.nextUrl.searchParams.get('tage')) || 7));
  const von = new Date();
  try {
    const belegt = await belegteZeiten(createAdminClient(), agencyId, von, new Date(von.getTime() + tage * 864e5));
    if (!belegt) return NextResponse.json({ verbunden: false, zeiten: [] });
    return NextResponse.json({ verbunden: true, zeiten: freieZeiten(belegt, { von, tage, minuten }).map((z) => ({ start: z.start.toISOString(), ende: z.ende.toISOString() })) });
  } catch (e) {
    return NextResponse.json({ verbunden: true, zeiten: [], fehler: e instanceof Error ? e.message : 'Kalender nicht erreichbar' });
  }
}
