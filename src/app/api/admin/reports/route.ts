import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();
  const { searchParams } = new URL(request.url);
  const agencyId = searchParams.get('agency_id');
  const typ = searchParams.get('typ');
  const status = searchParams.get('status');

  let query = admin
    .from('reports')
    .select('*, agencies(id, name)')
    .order('created_at', { ascending: false });

  if (agencyId) query = query.eq('agency_id', agencyId);
  if (typ) query = query.eq('typ', typ);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Fehler beim Laden der Reports' }, { status: 500 });
  }

  return NextResponse.json(data);
}
