import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Neue Einstellungs-Feiern seit ?seit=ISO – intern alle, beim Kunden nur die eigenen (Mandantentrennung) */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ feiern: [] }, { status: 401 });
  const intern = isInternal(user.role);
  if (!intern && !user.agency_id) return NextResponse.json({ feiern: [], jetzt: new Date().toISOString() });
  const seit = req.nextUrl.searchParams.get('seit');
  // +1 ms: Postgres speichert Mikrosekunden, JS nur Millisekunden
  const ab = seit && !Number.isNaN(Date.parse(seit)) ? new Date(Date.parse(seit) + 1) : new Date();
  // Nie ältere Feiern als 15 Minuten nachholen
  const frueheste = new Date(Date.now() - 15 * 60_000);
  let q = createAdminClient()
    .from('einstellung_feiern')
    .select('id, kunde, vorname, stelle, nr_kunde, created_at')
    .gt('created_at', (ab > frueheste ? ab : frueheste).toISOString())
    .order('created_at', { ascending: true })
    .limit(3);
  if (!intern) q = q.eq('agency_id', user.agency_id as string);
  const { data } = await q;
  return NextResponse.json({ feiern: data ?? [], jetzt: new Date().toISOString() });
}
