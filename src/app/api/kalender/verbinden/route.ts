import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { authUrl, baueState, providerBereit, type KalenderProvider } from '@/lib/kalender/kunden-kalender';

/** GET ?provider=google|microsoft – leitet zur Anmeldung beim Kalender-Anbieter weiter (Inhaber, Admins, Zoepp-Team) */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.redirect(new URL('/login', req.url));
  if (!['agency_owner', 'admin', 'employee'].includes(user.role)) return NextResponse.json({ error: 'Nur der Inhaber kann den Kalender verbinden' }, { status: 403 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  const p = req.nextUrl.searchParams.get('provider') as KalenderProvider | null;
  if (p !== 'google' && p !== 'microsoft') return NextResponse.json({ error: 'Unbekannter Anbieter' }, { status: 400 });
  if (!providerBereit(p)) return NextResponse.json({ error: 'Kalender-Anbindung ist noch nicht eingerichtet' }, { status: 503 });
  // Einmal-Schlüssel im Cookie: der Rücksprung gilt nur in genau diesem Browser
  const nonce = randomBytes(16).toString('base64url');
  const res = NextResponse.redirect(authUrl(p, baueState(agencyId, user.id, Date.now(), nonce)));
  res.cookies.set('zm_kalender_nonce', nonce, { httpOnly: true, secure: true, sameSite: 'lax', path: '/api/kalender', maxAge: 15 * 60 });
  return res;
}
