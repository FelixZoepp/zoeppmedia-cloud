import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Neue Deal-Feiern seit ?seit=ISO (für die Animation bei allen eingeloggten Mitarbeitern) */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ feiern: [] }, { status: 403 });
  const seit = req.nextUrl.searchParams.get('seit');
  // +1 ms: Postgres speichert Mikrosekunden, JS nur Millisekunden – sonst käme die letzte Feier immer wieder
  const ab = seit && !Number.isNaN(Date.parse(seit)) ? new Date(Date.parse(seit) + 1) : new Date();
  // Nie ältere Feiern als 15 Minuten nachholen (z. B. nach dem Wochenende)
  const frueheste = new Date(Date.now() - 15 * 60_000);
  const { data } = await createAdminClient()
    .from('deal_feiern')
    .select('id, firma, closer, volumen, gif, created_at')
    .gt('created_at', (ab > frueheste ? ab : frueheste).toISOString())
    .order('created_at', { ascending: true })
    .limit(3);
  return NextResponse.json({ feiern: data ?? [], jetzt: new Date().toISOString() });
}
