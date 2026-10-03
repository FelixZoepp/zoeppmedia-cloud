import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { setStepStatus, type StepStatus } from '@/lib/fulfillment/engine';

const STATUSES: StepStatus[] = ['offen', 'in_arbeit', 'zur_pruefung', 'erledigt', 'nicht_noetig'];

/**
 * Schritt intern bearbeiten: Status (auch "zurück an Kunden" = offen + Kommentar),
 * zuständige Person, Frist.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    status?: StepStatus; kommentar?: string | null; owner_user_id?: string | null; faellig_am?: string | null;
  };
  const svc = createAdminClient();

  const patch: Record<string, unknown> = {};
  if ('owner_user_id' in body) patch.owner_user_id = body.owner_user_id || null;
  if ('faellig_am' in body) patch.faellig_am = body.faellig_am || null;
  if (Object.keys(patch).length) {
    patch.updated_at = new Date().toISOString();
    await svc.from('client_steps').update(patch).eq('id', id);
  }

  let advancedTo = null;
  if (body.status) {
    if (!STATUSES.includes(body.status)) return NextResponse.json({ error: 'Unbekannter Status' }, { status: 400 });
    ({ advancedTo } = await setStepStatus(svc, id, body.status, { userId: user.id, kommentar: body.kommentar ?? null }));
  }
  return NextResponse.json({ ok: true, advancedTo });
}
