import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { getStagesForAgency } from '@/lib/pipeline/get-stages';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/pipeline-stages?agency_id=xxx
 * Returns stages for the current user's agency (or specified agency for admins).
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const agencyIdParam = request.nextUrl.searchParams.get('agency_id');

  // Admins/employees can query any agency; others only their own
  let agencyId: string | null;
  if (isInternal(user.role) && agencyIdParam) {
    agencyId = agencyIdParam;
  } else {
    agencyId = user.agency_id;
  }

  const stages = await getStagesForAgency(admin, agencyId);
  return NextResponse.json(stages);
}

/**
 * POST /api/pipeline-stages
 * Creates custom stages for an agency (admin/owner only).
 * Body: { agency_id: string, stages: Array<{ name: string, sort_order: number, color: string }> }
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { agency_id, stages } = body as {
    agency_id: string;
    stages: Array<{ name: string; sort_order: number; color: string }>;
  };

  if (!agency_id || !stages || !Array.isArray(stages) || stages.length === 0) {
    return NextResponse.json({ error: 'agency_id und stages sind erforderlich.' }, { status: 400 });
  }

  // Only admins/employees or the agency owner can create stages
  if (!isInternal(user.role) && user.agency_id !== agency_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Check if any candidates reference existing custom stages for this agency
  const { data: existingStages } = await admin
    .from('pipeline_stages')
    .select('id')
    .eq('agency_id', agency_id);

  if (existingStages && existingStages.length > 0) {
    const existingIds = existingStages.map((s) => s.id);

    const { count } = await admin
      .from('candidates')
      .select('id', { count: 'exact', head: true })
      .in('current_stage_id', existingIds);

    if (count && count > 0) {
      return NextResponse.json(
        { error: 'Phasen können nicht ersetzt werden, solange Bewerber sie verwenden.' },
        { status: 409 }
      );
    }

    // Delete existing custom stages (no candidates reference them)
    await admin
      .from('pipeline_stages')
      .delete()
      .eq('agency_id', agency_id);
  }

  // Insert new custom stages
  const { data: created, error } = await admin
    .from('pipeline_stages')
    .insert(
      stages.map((s) => ({
        agency_id,
        name: s.name,
        sort_order: s.sort_order,
        color: s.color,
      }))
    )
    .select();

  if (error) {
    return NextResponse.json({ error: 'Phasen konnten nicht erstellt werden.' }, { status: 500 });
  }

  return NextResponse.json(created, { status: 201 });
}

/**
 * PUT /api/pipeline-stages
 * Updates a single stage.
 * Body: { id: string, name?: string, color?: string, sort_order?: number }
 */
export async function PUT(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, name, color, sort_order } = body as {
    id: string;
    name?: string;
    color?: string;
    sort_order?: number;
  };

  if (!id) {
    return NextResponse.json({ error: 'id ist erforderlich.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch the stage to check ownership
  const { data: stage } = await admin
    .from('pipeline_stages')
    .select('agency_id')
    .eq('id', id)
    .single();

  if (!stage) {
    return NextResponse.json({ error: 'Phase nicht gefunden.' }, { status: 404 });
  }

  // Only admins/employees can edit global stages; agency owners can edit their own
  if (stage.agency_id === null && !isInternal(user.role)) {
    return NextResponse.json({ error: 'Nur Admins können globale Phasen bearbeiten.' }, { status: 403 });
  }

  if (stage.agency_id !== null && !isInternal(user.role) && user.agency_id !== stage.agency_id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name;
  if (color !== undefined) updates.color = color;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine Änderungen angegeben.' }, { status: 400 });
  }

  const { data: updated, error } = await admin
    .from('pipeline_stages')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: 'Update fehlgeschlagen.' }, { status: 500 });
  }

  return NextResponse.json(updated);
}
