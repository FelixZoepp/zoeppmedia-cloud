import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { detectProblemsForAgency } from '@/lib/problems/detect';

export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: agencies } = await supabase.from('agencies').select('id');

  let totalDetected = 0;
  let totalResolved = 0;

  for (const agency of agencies || []) {
    const { detected, resolved } = await detectProblemsForAgency(supabase, agency.id);
    totalDetected += detected;
    totalResolved += resolved;
  }

  return NextResponse.json({
    detected: totalDetected,
    resolved: totalResolved,
    agencies: (agencies || []).length,
  });
}
