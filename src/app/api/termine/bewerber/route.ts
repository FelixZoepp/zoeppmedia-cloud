import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** GET /api/termine/bewerber?q=… – Bewerber der Agentur für die Terminanlage suchen */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId(user);
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  // PostgREST-Sonderzeichen entfernen, damit die Suche nicht als Filter-Syntax gelesen wird
  const q = (req.nextUrl.searchParams.get('q') ?? '').replace(/[%,()*]/g, ' ').trim().slice(0, 60);
  let query = createAdminClient()
    .from('candidates')
    .select('id, name, phone, email')
    .eq('agency_id', agencyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(40);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: 'Suche fehlgeschlagen' }, { status: 500 });
  // Ohne Telefon und E-Mail lässt sich niemand einladen (z. B. Indeed-Platzhalter, deren Daten noch nachgeholt werden)
  const erreichbar = ((data ?? []) as Array<{ phone: string | null; email: string | null }>).filter((b) => b.phone || b.email);
  return NextResponse.json(erreichbar.slice(0, 12));
}
