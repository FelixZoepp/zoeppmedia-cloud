import { createServerClient } from '@/lib/supabase/server';
import { NextResponse, type NextRequest } from 'next/server';
import { IMPERSONATION_COOKIE } from '@/lib/recruiting/scope';

async function abmelden() {
  const supabase = await createServerClient();
  await supabase.auth.signOut();
  const res = NextResponse.redirect(new URL('/login', process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'));
  // Kunden-Ansicht und Demo-Ansicht nicht in die nächste Sitzung mitnehmen
  res.cookies.delete(IMPERSONATION_COOKIE);
  res.cookies.delete('zmc_ansicht');
  return res;
}

/** GET (Link in der Sidebar) – nur von der eigenen Seite, fremde Seiten können niemanden abmelden (Logout-CSRF) */
export async function GET(request: NextRequest) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return NextResponse.redirect(new URL('/', request.url));
  }
  return abmelden();
}

export async function POST() {
  return abmelden();
}
