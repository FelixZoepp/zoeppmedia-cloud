import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { authUrl, baueState, providerBereit, type KalenderProvider } from '@/lib/kalender/kunden-kalender';

/** GET ?provider=google|microsoft – leitet zur Anmeldung beim Kalender-Anbieter weiter */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));
  if (!['agency_owner', 'agency_member', 'admin', 'employee'].includes(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  const p = req.nextUrl.searchParams.get('provider') as KalenderProvider | null;
  if (p !== 'google' && p !== 'microsoft') return NextResponse.json({ error: 'Unbekannter Anbieter' }, { status: 400 });
  if (!providerBereit(p)) return NextResponse.json({ error: 'Kalender-Anbindung ist noch nicht eingerichtet' }, { status: 503 });
  return NextResponse.redirect(authUrl(p, baueState(agencyId, user.id)));
}
