import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { pruefeState, verbindeKalender, type OAuthProvider } from '@/lib/kalender/kunden-kalender';

/** Rücksprung vom Kalender-Anbieter: Code tauschen, Verbindung speichern, Onboarding-Schritt abhaken */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const ziel = req.cookies.get('zm_kalender_zurueck')?.value === 'onboarding' ? '/onboarding' : '/settings/kalender';
  const zurueck = (q: string) => {
    const r = NextResponse.redirect(new URL(`${ziel}?kalender=1&${q}`, req.url));
    r.cookies.delete('zm_kalender_zurueck');
    return r;
  };
  if (provider !== 'google' && provider !== 'microsoft') return zurueck('fehler=anbieter');
  const fehler = req.nextUrl.searchParams.get('error');
  if (fehler) return zurueck(`fehler=${encodeURIComponent(fehler)}`);
  const code = req.nextUrl.searchParams.get('code');
  const state = pruefeState(req.nextUrl.searchParams.get('state') ?? '');
  if (!code || !state) return zurueck('fehler=abgelaufen');
  // Nur derselbe angemeldete Nutzer im selben Browser (Einmal-Schlüssel) darf den Rücksprung abschließen
  const user = await getCurrentUser();
  const nonce = req.cookies.get('zm_kalender_nonce')?.value;
  if (!user || user.id !== state.userId || !nonce || nonce !== state.nonce) return zurueck('fehler=abgelaufen');
  const svc = createAdminClient();
  try {
    await verbindeKalender(svc, provider as OAuthProvider, code, state.agencyId, state.userId);
    const { signalSafe } = await import('@/lib/fulfillment/engine');
    await signalSafe(svc, state.agencyId, 'kalender_verbunden');
    await svc.from('audit_log').insert({ actor_id: state.userId, agency_id: state.agencyId, action: 'kalender.verbunden', target: provider, data: {} });
    const ok = zurueck('verbunden=1');
    ok.cookies.delete('zm_kalender_nonce');
    return ok;
  } catch (e) {
    return zurueck(`fehler=${encodeURIComponent((e instanceof Error ? e.message : 'Fehler').slice(0, 200))}`);
  }
}
