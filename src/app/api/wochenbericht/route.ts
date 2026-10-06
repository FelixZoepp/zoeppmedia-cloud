import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeWochenbericht } from '@/lib/wochenbericht/laden';
import { fuerKunde } from '@/lib/wochenbericht/berechnung';

export const maxDuration = 60;

/** GET – aktueller Wochenüberblick der eigenen Agentur (Kunden-Cloud) */
export async function GET() {
  const user = await getCurrentUser();
  const agencyId = await getEffectiveAgencyId();
  if (!user || !agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  const bericht = await ladeWochenbericht(createAdminClient(), agencyId, new Date(), { mitEmpfehlung: false });
  // Nur der neutrale Überblick – interne Ampel bleibt beim Team
  return NextResponse.json({ bericht: bericht ? fuerKunde(bericht) : null });
}
