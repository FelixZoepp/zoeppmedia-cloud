import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isInternal, isAgency } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();

  const { data: item } = await supabase
    .from('access_items')
    .select('*')
    .eq('id', id)
    .single();

  if (!item) return NextResponse.json({ error: 'Zugang nicht gefunden' }, { status: 404 });

  // Scope check
  if (isAgency(user.role) && item.agency_id !== user.agency_id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    // Agency users can only set 'erfuellt'
    if (isAgency(user.role) && body.status !== 'erfuellt') {
      return NextResponse.json({ error: 'Agenturen koennen nur den Status erfuellt setzen' }, { status: 400 });
    }
    update.status = body.status;
  }

  // Only internal users can update these fields
  if (isInternal(user.role)) {
    if (body.hinweis_fuer_kunden !== undefined) update.hinweis_fuer_kunden = body.hinweis_fuer_kunden;
    if (body.anleitung_url !== undefined) update.anleitung_url = body.anleitung_url;
    if (body.pflicht !== undefined) update.pflicht = body.pflicht;
    if (body.label !== undefined) update.label = body.label;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'Keine Aenderungen' }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('access_items')
    .update(update)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
