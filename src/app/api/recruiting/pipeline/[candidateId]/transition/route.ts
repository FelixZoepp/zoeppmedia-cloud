import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { transitionCandidate } from '@/lib/recruiting/stage-transition';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/recruiting/pipeline/[candidateId]/transition
 *
 * Transitions a candidate to the next recruiting stage.
 * Body: { nach_stage: string, notiz?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ candidateId: string }> }
) {
  const { candidateId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { nach_stage, notiz } = body as {
    nach_stage: string;
    notiz?: string;
  };

  if (!nach_stage) {
    return NextResponse.json(
      { error: 'nach_stage ist erforderlich' },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // Check candidate belongs to user's agency (unless internal)
  if (!isInternal(user.role)) {
    const { data: candidate } = await admin
      .from('candidates')
      .select('agency_id')
      .eq('id', candidateId)
      .single();

    if (!candidate) {
      return NextResponse.json({ error: 'Bewerber nicht gefunden' }, { status: 404 });
    }

    if (candidate.agency_id !== user.agency_id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
  }

  const result = await transitionCandidate(
    admin,
    candidateId,
    nach_stage,
    user.id,
    notiz
  );

  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    success: true,
    event_id: result.event_id,
    message: `Bewerber nach "${nach_stage}" verschoben`,
  });
}
