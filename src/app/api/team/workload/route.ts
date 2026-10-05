import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadTeamWorkload } from '@/lib/team/workload';

/** Team-Auslastung: offene/erledigte Aufgaben je Mitarbeiter über alle Aufgaben-Quellen. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  return NextResponse.json(await loadTeamWorkload(createAdminClient()));
}
