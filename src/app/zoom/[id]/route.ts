import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { SALES_AGENCY_ID } from '@/lib/sales/calendly-chain';
import { zoomZiel } from '@/lib/sales/zoom-link';

export const dynamic = 'force-dynamic';

/**
 * Button „Zum Zoom-Meeting“ aus der WhatsApp-Erinnerung (beratung_reminder_1h):
 * ressourcen.felixzoepp.de/zoom/<Calendly-Event-ID> → hier → echter Zoom-Link aus der Calendly-Buchung.
 * Kein Zoom-Link (oder abgesagt) → Terminseite, damit niemand auf einer Fehlerseite landet.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const fallback = new URL(`/termin/${encodeURIComponent(id)}`, 'https://cloud.zoeppmedia.de');
  if (!/^[A-Za-z0-9_-]{6,80}$/.test(id)) return NextResponse.redirect(fallback, 302);

  const { data } = await createAdminClient()
    .from('calendly_events')
    .select('location, status')
    .eq('agency_id', SALES_AGENCY_ID)
    .eq('calendly_event_id', id)
    .maybeSingle();
  const ziel = zoomZiel(data as { location: string | null; status: string | null } | null);
  return NextResponse.redirect(ziel ?? fallback, 302);
}
