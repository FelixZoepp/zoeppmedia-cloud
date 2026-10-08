import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { tauscheCode } from '@/lib/perspective/oauth';
import { codeAusUrl, dekodiereZwischenstand, OAUTH_COOKIE, OAUTH_COOKIE_PFAD } from '@/lib/perspective/oauth-cookie';

/** Fallback: zurückkopierte Localhost-Callback-URL ({ url }) einlösen. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur Admins' }, { status: 403 });

  const zwischen = dekodiereZwischenstand(req.cookies.get(OAUTH_COOKIE)?.value);
  if (!zwischen) return NextResponse.json({ error: 'Kein laufender Verbindungsversuch – bitte zuerst „Manuell verbinden“ starten' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as { url?: string };
  const { code, state, fehler } = codeAusUrl(body.url ?? '');
  if (fehler) return NextResponse.json({ error: fehler }, { status: 400 });
  if (!code || state !== zwischen.state) return NextResponse.json({ error: 'Die URL passt nicht zum Verbindungsversuch – bitte neu starten' }, { status: 400 });

  try {
    const { companyId } = await tauscheCode(createAdminClient(), { code, verifier: zwischen.verifier, redirectUri: zwischen.redirectUri, userId: user.id });
    const res = NextResponse.json({ ok: true, companyId });
    res.cookies.set(OAUTH_COOKIE, '', { path: OAUTH_COOKIE_PFAD, maxAge: 0 });
    return res;
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Token-Tausch fehlgeschlagen' }, { status: 400 });
  }
}
