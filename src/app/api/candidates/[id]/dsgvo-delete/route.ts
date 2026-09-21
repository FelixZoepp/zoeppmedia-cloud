// src/app/api/candidates/[id]/dsgvo-delete/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { anonymizeCandidate } from '@/lib/dsgvo/retention';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  if (!canWriteRole(user.role))
    return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id } = await params;
  const svc = createAdminClient();

  // Existenz-Check — agency-gescoped (fremde Agentur → 404, kein Leak)
  const { data: existing } = await svc
    .from('candidates')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('id', id)
    .maybeSingle();

  if (!existing) return NextResponse.json({ error: 'Kandidat nicht gefunden' }, { status: 404 });

  // anonymizeCandidate auditiert selbst mit action 'anonymize'
  await anonymizeCandidate(svc, agencyId, id, user.id);

  return NextResponse.json({ ok: true });
}
