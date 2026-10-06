import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeEmpfehlungen } from '@/lib/empfehlungen/laden';

/** GET /api/empfehlungen – Effizienz-Tipps und passende Leistungen für die eigene (bzw. geöffnete) Kunden-Cloud */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Kunden-Cloud geöffnet' }, { status: 400 });
  try {
    return NextResponse.json(await ladeEmpfehlungen(createAdminClient(), agencyId));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Empfehlungen konnten nicht geladen werden' }, { status: 500 });
  }
}
