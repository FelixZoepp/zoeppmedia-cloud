import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { BOOKING_URLS, isPreviewBot, parseClickToken, recordClick } from '@/lib/sales/tracking';

/**
 * "Termin buchen"-Button aus den Sales-WhatsApp-Vorlagen: Klick erfassen, dann zu Calendly.
 * Ungültiger Token oder Fehler → trotzdem zu Calendly (der Lead soll immer buchen können).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const click = parseClickToken(token);
  if (!click) return NextResponse.redirect(BOOKING_URLS.setting, 302);
  if (isPreviewBot(request.headers.get('user-agent'))) return NextResponse.redirect(BOOKING_URLS[click.target], 302);

  try {
    const target = await recordClick(createAdminClient(), click);
    return NextResponse.redirect(target, 302);
  } catch (err) {
    console.error('[sales] Klick-Tracking fehlgeschlagen:', err);
    return NextResponse.redirect(BOOKING_URLS[click.target], 302);
  }
}
