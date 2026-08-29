import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/recruiting/assets?stage_key=xxx&agency_id=xxx
 *
 * Lists stage assets filtered by stage_key and optionally agency_id.
 * Returns global assets (agency_id IS NULL) plus agency-specific ones.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const stageKey = request.nextUrl.searchParams.get('stage_key');
  const agencyIdParam = request.nextUrl.searchParams.get('agency_id');

  if (!stageKey) {
    return NextResponse.json(
      { error: 'stage_key ist erforderlich' },
      { status: 400 }
    );
  }

  let agencyId: string | null;
  if (isInternal(user.role) && agencyIdParam) {
    agencyId = agencyIdParam;
  } else {
    agencyId = user.agency_id;
  }

  const admin = createAdminClient();

  // Get global assets + agency-specific assets
  let query = admin
    .from('stage_assets')
    .select('*')
    .eq('stage_key', stageKey)
    .order('created_at', { ascending: true });

  if (agencyId) {
    // Global (agency_id IS NULL) OR matching agency
    query = query.or(`agency_id.is.null,agency_id.eq.${agencyId}`);
  } else {
    // Only global assets
    query = query.is('agency_id', null);
  }

  const { data: assets, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(assets);
}

/**
 * POST /api/recruiting/assets
 *
 * Creates or updates a stage asset.
 * Body: { stage_key, typ, titel, url?, inhalt?, agency_id? }
 * For updates, include { id } in the body.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Only internal users or agency owners can manage assets
  if (!isInternal(user.role) && user.role !== 'agency_owner') {
    return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 403 });
  }

  const body = await request.json();
  const { id, stage_key, typ, titel, url, inhalt, agency_id } = body as {
    id?: string;
    stage_key: string;
    typ: string;
    titel: string;
    url?: string;
    inhalt?: string;
    agency_id?: string;
  };

  if (!stage_key || !typ || !titel) {
    return NextResponse.json(
      { error: 'stage_key, typ und titel sind erforderlich' },
      { status: 400 }
    );
  }

  const validTypes = ['skript', 'video', 'vorlage', 'checkliste'];
  if (!validTypes.includes(typ)) {
    return NextResponse.json(
      { error: `Ungültiger typ. Erlaubt: ${validTypes.join(', ')}` },
      { status: 400 }
    );
  }

  // Non-internal users can only create assets for their own agency
  const effectiveAgencyId = isInternal(user.role)
    ? agency_id ?? null
    : user.agency_id;

  const admin = createAdminClient();

  if (id) {
    // Update existing asset
    const { data: updated, error } = await admin
      .from('stage_assets')
      .update({
        stage_key,
        typ,
        titel,
        url: url ?? null,
        inhalt: inhalt ?? null,
        agency_id: effectiveAgencyId,
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(updated);
  }

  // Create new asset
  const { data: created, error } = await admin
    .from('stage_assets')
    .insert({
      stage_key,
      typ,
      titel,
      url: url ?? null,
      inhalt: inhalt ?? null,
      agency_id: effectiveAgencyId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(created, { status: 201 });
}
