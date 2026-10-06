import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeErgebnisse } from '@/lib/kunden-cloud/ergebnisse';

/** GET /api/ergebnisse – Recruiting-Ergebnisse aller Kunden (30 Tage) für das interne Team */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const svc = createAdminClient();
  try {
    const [kunden, { data: zuordnung }] = await Promise.all([
      ladeErgebnisse(svc),
      svc.from('employee_assignments').select('agency_id').eq('employee_id', user.id),
    ]);
    // „Meine Kunden“: als Ansprechpartner hinterlegt oder fest zugeordnet
    const meine = new Set([
      ...kunden.filter((k) => k.csm_user_id === user.id).map((k) => k.id),
      ...((zuordnung ?? []) as Array<{ agency_id: string }>).map((z) => z.agency_id),
    ]);
    return NextResponse.json({ kunden, meine: [...meine], stand: new Date().toISOString() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
