import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { googleLink, outlookLink } from '@/lib/sales/termin-kalender';
import { ladeSalesTermin } from '@/lib/sales/termin-laden';
import { erfasseTerminAktion } from '@/lib/sales/termin-tracking';

/** Kalender-Knöpfe der Terminseite: Klick erfassen, dann weiter zu Google bzw. Outlook */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ziel = req.nextUrl.searchParams.get('ziel') === 'outlook' ? 'outlook' : 'google';
  const t = await ladeSalesTermin(id);
  if (!t) return NextResponse.redirect(new URL(`/termin/${encodeURIComponent(id)}`, req.url), 302);
  const ua = req.headers.get('user-agent');
  after(() => erfasseTerminAktion(createAdminClient(), id, ziel, ua));
  return NextResponse.redirect(ziel === 'outlook' ? outlookLink(t) : googleLink(t), 302);
}
