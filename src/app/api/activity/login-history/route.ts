import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isAdmin, isInternalUser } from '@/lib/admin';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const agency_id = searchParams.get('agency_id');
  const limit = Math.min(Number(searchParams.get('limit') || '50'), 200);

  const admin = createAdminClient();

  let query = admin
    .from('login_history')
    .select('*, user:users(name, email)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (agency_id) query = query.eq('agency_id', agency_id);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Compute summary stats per agency if agency_id provided
  if (agency_id && data) {
    const now = Date.now();
    const last7 = data.filter(
      (e) => now - new Date(e.created_at).getTime() < 7 * 86400000
    ).length;
    const last30 = data.filter(
      (e) => now - new Date(e.created_at).getTime() < 30 * 86400000
    ).length;
    const lastLogin = data[0]?.created_at ?? null;

    return NextResponse.json({ entries: data, last7, last30, lastLogin });
  }

  return NextResponse.json(data ?? []);
}
