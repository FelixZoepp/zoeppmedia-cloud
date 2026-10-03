import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadBoard } from '@/lib/fulfillment/views';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const svc = createAdminClient();
  let agencyIds: string[] | null = null;
  // Mitarbeiter mit festen Kunden-Zuordnungen sehen nur diese
  if (user.role === 'employee') {
    const { data } = await svc.from('employee_assignments').select('agency_id').eq('employee_id', user.id);
    const assigned = (data ?? []).map((a: { agency_id: string }) => a.agency_id);
    if (assigned.length) agencyIds = assigned;
  }
  return NextResponse.json(await loadBoard(svc, agencyIds));
}
