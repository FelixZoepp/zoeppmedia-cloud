import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sicheresZiel } from '@/lib/kunden-cloud/ziel';
import { authorizeUrl, clientIdHolen, cloudRedirectUri, MANUELL_REDIRECT, pkcePaar } from '@/lib/perspective/oauth';
import { kodiereZwischenstand, OAUTH_COOKIE, OAUTH_COOKIE_PFAD } from '@/lib/perspective/oauth-cookie';

/**
 * „Perspective verbinden“ (nur Admins): PKCE + state erzeugen, Zwischenstand ins httpOnly-Cookie,
 * weiter zu Perspective. ?modus=manuell nutzt den Localhost-Callback (URL wird danach zurückkopiert).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur Admins' }, { status: 403 });

  const manuell = req.nextUrl.searchParams.get('modus') === 'manuell';
  const zurueck = sicheresZiel(req.nextUrl.searchParams.get('zurueck') || '/admin/anbindung', req.nextUrl.origin);
  const redirectUri = manuell ? MANUELL_REDIRECT : cloudRedirectUri();

  let clientId: string;
  try {
    clientId = await clientIdHolen(createAdminClient());
  } catch (err) {
    zurueck.searchParams.set('perspective', 'fehler');
    zurueck.searchParams.set('grund', err instanceof Error ? err.message.slice(0, 200) : 'Registrierung fehlgeschlagen');
    return NextResponse.redirect(zurueck);
  }

  const { verifier, challenge, state } = pkcePaar();
  const res = NextResponse.redirect(authorizeUrl({ clientId, redirectUri, state, challenge }));
  res.cookies.set(OAUTH_COOKIE, kodiereZwischenstand({ state, verifier, redirectUri, zurueck: zurueck.pathname + zurueck.search }), {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: OAUTH_COOKIE_PFAD,
    maxAge: 600,
  });
  return res;
}
