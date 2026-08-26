import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entity_type');
  const entityId = searchParams.get('entity_id');
  const userId = searchParams.get('user_id');
  const agencyId = searchParams.get('agency_id');
  const action = searchParams.get('action');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  const admin = createAdminClient();

  // Build filtered query
  let query = admin
    .from('audit_log')
    .select('*, users:user_id(name, email)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);
  if (userId) query = query.eq('user_id', userId);
  if (agencyId) query = query.eq('agency_id', agencyId);
  if (action) query = query.eq('action', action);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Fehler beim Laden der Audit-Daten.' }, { status: 500 });
  }

  return NextResponse.json({ data: data ?? [], total: count ?? 0 });
}
