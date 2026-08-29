import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';

// GET — list integration logs, filterable by system, agency_id
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const system = request.nextUrl.searchParams.get('system');
  const agencyId = request.nextUrl.searchParams.get('agency_id');
  const fehlerOnly = request.nextUrl.searchParams.get('fehler') === 'true';
  const limitParam = request.nextUrl.searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;

  const admin = createAdminClient();

  let query = admin
    .from('integration_logs')
    .select('*')
    .order('zeitpunkt', { ascending: false })
    .limit(limit);

  if (system && ['lexoffice', 'mollie'].includes(system)) {
    query = query.eq('system', system);
  }

  if (agencyId) {
    query = query.eq('agency_id', agencyId);
  }

  if (fehlerOnly) {
    query = query.eq('fehler', true);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data ?? []);
}
