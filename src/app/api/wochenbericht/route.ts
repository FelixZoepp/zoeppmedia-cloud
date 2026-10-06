import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeWochenbericht } from '@/lib/wochenbericht/laden';

export const maxDuration = 60;

/** GET – aktueller Wochenstand der eigenen Agentur (Kunden-Cloud) */
export async function GET() {
  const user = await getCurrentUser();
  const agencyId = await getEffectiveAgencyId();
  if (!user || !agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  const bericht = await ladeWochenbericht(createAdminClient(), agencyId, new Date(), { mitEmpfehlung: false });
  return NextResponse.json({ bericht });
}
