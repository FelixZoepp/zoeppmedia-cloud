import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { NextResponse } from 'next/server';
import type { ClientPhase } from '../route';

const VALID_PHASES: ClientPhase[] = [
  'onboarding_termin',
  'fulfillment',
  'warten_zugaenge',
  'warten_starttermin',
  'kampagne_live',
  'kickoff_14d',
  'bestandskunde',
];

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const body = await request.json();
  const agencyId = body.agency_id as string;
  const phase = body.phase as ClientPhase;

  if (!agencyId || !VALID_PHASES.includes(phase)) {
    return NextResponse.json({ error: 'Ungültige Anfrage' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('agencies')
    .update({ phase_override: phase, phase_override_at: new Date().toISOString() })
    .eq('id', agencyId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
