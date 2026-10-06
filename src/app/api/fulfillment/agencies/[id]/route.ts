import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadAgencySteps } from '@/lib/fulfillment/views';
import { advanceIfPhaseDone, startPhase } from '@/lib/fulfillment/engine';
import { PHASES, type Phase } from '@/lib/fulfillment/catalog';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  return NextResponse.json(await loadAgencySteps(createAdminClient(), id));
}

/** Phase manuell setzen (Drag & Drop auf dem Board, Offboarding starten). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { phase?: string; pausiert_grund?: string | null };
  const svc = createAdminClient();

  if ('pausiert_grund' in body) {
    await svc.from('agencies').update({ pausiert_grund: body.pausiert_grund || null }).eq('id', id);
  }
  if (body.phase) {
    if (!PHASES.some((p) => p.key === body.phase)) return NextResponse.json({ error: 'Unbekannte Phase' }, { status: 400 });
    try {
      await startPhase(svc, id, body.phase as Phase);
      // Zurück in eine Phase, deren Schritte schon alle erledigt sind → sonst bliebe der Kunde dort hängen
      const advancedTo = await advanceIfPhaseDone(svc, id);
      return NextResponse.json({ ok: true, advancedTo });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : 'Phase konnte nicht gesetzt werden' }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true, advancedTo: null });
}
