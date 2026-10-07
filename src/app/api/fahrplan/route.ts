import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeFahrplan } from '@/lib/fulfillment/fahrplan';

/** GET – Fahrplan des Kunden (eigene Agentur bzw. die geöffnete Kunden-Cloud) */
export async function GET() {
  const user = await getCurrentUser();
  const agencyId = await getEffectiveAgencyId();
  if (!user || !agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  return NextResponse.json({ fahrplan: await ladeFahrplan(createAdminClient(), agencyId) });
}
