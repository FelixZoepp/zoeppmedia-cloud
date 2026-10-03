import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { completeCustomerStep } from '@/lib/fulfillment/engine';

/** Kunde hakt eine eigene Aufgabe ab (mit Prüfung → geht zum Team, sonst direkt erledigt). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  const agencyId = await getEffectiveAgencyId();
  if (!user || !agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { kommentar?: string };

  const svc = createAdminClient();
  const { data: step } = await svc.from('client_steps').select('agency_id').eq('id', id).maybeSingle();
  if (!step || (step as { agency_id: string }).agency_id !== agencyId) {
    return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });
  }
  try {
    const status = await completeCustomerStep(svc, id, user.id, body.kommentar?.slice(0, 1000) ?? null);
    return NextResponse.json({ ok: true, status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 400 });
  }
}
