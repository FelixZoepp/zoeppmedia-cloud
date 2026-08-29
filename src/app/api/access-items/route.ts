import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, isInternal, isAgency } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createAdminClient();
  const { searchParams } = new URL(request.url);

  let agencyId: string | null = null;

  if (isInternal(user.role)) {
    agencyId = searchParams.get('agency_id');
    if (!agencyId) {
      return NextResponse.json({ error: 'agency_id ist ein Pflichtfeld fuer interne Benutzer' }, { status: 400 });
    }
  } else if (isAgency(user.role)) {
    agencyId = user.agency_id;
    if (!agencyId) {
      return NextResponse.json({ error: 'Keine Agentur zugeordnet' }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from('access_items')
    .select('*')
    .eq('agency_id', agencyId!)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json({ error: 'id und status sind Pflichtfelder' }, { status: 400 });
  }

  const supabase = createAdminClient();

  // Fetch the access item
  const { data: item } = await supabase
    .from('access_items')
    .select('*')
    .eq('id', id)
    .single();

  if (!item) return NextResponse.json({ error: 'Zugang nicht gefunden' }, { status: 404 });

  // Agency users can only set 'erfuellt'
  if (isAgency(user.role)) {
    if (item.agency_id !== user.agency_id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (status !== 'erfuellt') {
      return NextResponse.json({ error: 'Agenturen koennen nur den Status erfuellt setzen' }, { status: 400 });
    }
  }

  const { data, error } = await supabase
    .from('access_items')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
