import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isAgency } from '@/lib/auth';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isAgency(user.role) || !user.agency_id) {
    return NextResponse.json({ error: 'Nur fuer Agenturen' }, { status: 403 });
  }

  const supabase = createAdminClient();

  const { data: agency, error } = await supabase
    .from('agencies')
    .select('fulfillment_phase, pausiert_grund, garantie_start, garantie_ende')
    .eq('id', user.agency_id)
    .single();

  if (error || !agency) {
    return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
  }

  // „status“ aus der Fulfillment-Phase ableiten (agencies.status gibt es nicht mehr)
  const a = agency as { fulfillment_phase: string | null; pausiert_grund: string | null; garantie_start: string | null; garantie_ende: string | null };
  const status = a.pausiert_grund ? 'pausiert' : a.fulfillment_phase === 'continuity' ? 'live' : (a.fulfillment_phase ?? 'onboarding');
  return NextResponse.json({ status, garantie_start: a.garantie_start, garantie_ende: a.garantie_ende });
}
