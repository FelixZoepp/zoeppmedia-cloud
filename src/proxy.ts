import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Öffentliche Pfade brauchen keine Session. API-Routes prüfen ihre Auth selbst
// (Webhooks/Crons per Signatur bzw. Secret), daher hier kein Auth-Roundtrip.
function isPublicPath(pathname: string) {
  return (
    pathname.startsWith('/login') ||
    pathname.startsWith('/k/') ||
    // Öffentliche Links für Bewerber/Kontakte: Termin buchen, Dankevideo, Termin in den Kalender
    pathname.startsWith('/book/') ||
    pathname.startsWith('/video/') ||
    pathname.startsWith('/termin/') ||
    pathname.startsWith('/gespraech/') ||
    // Zufriedenheits-Umfrage über persönlichen Link (ohne Login)
    pathname.startsWith('/umfrage/') ||
    // Vertragsbestätigung über persönlichen Link (vor der Registrierung)
    pathname.startsWith('/vertrag/') ||
    pathname === '/apply' || pathname.startsWith('/apply/') ||
    pathname.startsWith('/register') ||
    pathname.startsWith('/register-employee') ||
    pathname.startsWith('/forgot-password') ||
    pathname.startsWith('/reset-password') ||
    pathname.startsWith('/api/') ||
    // PWA-Assets müssen ohne Login erreichbar sein (Manifest, Service Worker, Offline-Seite)
    pathname === '/manifest.json' ||
    pathname === '/sw.js' ||
    pathname === '/offline'
  );
}

const INTERNAL_PREFIXES = ['/admin', '/clients', '/tasks', '/invites', '/funnels', '/team', '/playbook', '/profile', '/employee-reports', '/innendienst', '/ergebnisse'];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims prüft das JWT (bei asymmetrischen Keys lokal) und frischt die Session bei Bedarf auf
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  // Not authenticated → redirect to login
  if (!userId) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  const needsOnboardingCheck = !pathname.startsWith('/onboarding') && !pathname.startsWith('/settings');
  const isInternalRoute = INTERNAL_PREFIXES.some((p) => pathname.startsWith(p));
  if (!needsOnboardingCheck && !isInternalRoute) return supabaseResponse;

  const { data: profile } = await supabase
    .from('users')
    .select('role, agency_id')
    .eq('id', userId)
    .single();
  const role = profile?.role as string;

  // Onboarding füllt nur der Inhaber aus – Mitarbeiter des Kunden dürfen direkt arbeiten
  if (needsOnboardingCheck && role === 'agency_owner' && profile?.agency_id) {
    const { data: agency } = await supabase
      .from('agencies')
      .select('onboarding_completed')
      .eq('id', profile.agency_id)
      .single();

    if (agency && !agency.onboarding_completed) {
      const url = request.nextUrl.clone();
      url.pathname = '/onboarding';
      return NextResponse.redirect(url);
    }
  }

  // Admin/internal routes → check role
  if (isInternalRoute && role !== 'admin' && role !== 'employee') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
