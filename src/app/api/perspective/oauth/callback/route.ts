import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sicheresZiel } from '@/lib/kunden-cloud/ziel';
import { tauscheCode } from '@/lib/perspective/oauth';
import { dekodiereZwischenstand, OAUTH_COOKIE, OAUTH_COOKIE_PFAD } from '@/lib/perspective/oauth-cookie';

/** Rücksprung von Perspective: state prüfen, Code tauschen, Tokens verschlüsselt speichern. */
export async function GET(req: NextRequest) {
  const zwischen = dekodiereZwischenstand(req.cookies.get(OAUTH_COOKIE)?.value);
  const ziel = sicheresZiel(zwischen?.zurueck ?? '/admin/anbindung', req.nextUrl.origin);
  const fertig = (ergebnis: 'verbunden' | 'fehler', grund?: string) => {
    ziel.searchParams.set('perspective', ergebnis);
    if (grund) ziel.searchParams.set('grund', grund.slice(0, 200));
    const res = NextResponse.redirect(ziel);
    res.cookies.set(OAUTH_COOKIE, '', { path: OAUTH_COOKIE_PFAD, maxAge: 0 });
    return res;
  };

  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return fertig('fehler', 'Nur Admins können Perspective verbinden');

  const p = req.nextUrl.searchParams;
  if (p.get('error')) return fertig('fehler', p.get('error_description') || p.get('error') || 'Abgebrochen');
  const code = p.get('code');
  if (!zwischen || !code || p.get('state') !== zwischen.state) return fertig('fehler', 'Sitzung abgelaufen oder ungültig – bitte erneut verbinden');

  try {
    await tauscheCode(createAdminClient(), { code, verifier: zwischen.verifier, redirectUri: zwischen.redirectUri, userId: user.id });
    return fertig('verbunden');
  } catch (err) {
    return fertig('fehler', err instanceof Error ? err.message : 'Token-Tausch fehlgeschlagen');
  }
}
