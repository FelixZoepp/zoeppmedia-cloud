import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  let agencyId = searchParams.get('agency_id');

  // Resolve "me" → current user's agency_id
  if (agencyId === 'me') {
    const { data: profile } = await supabase
      .from('users')
      .select('agency_id')
      .eq('id', user.id)
      .single();
    agencyId = profile?.agency_id ?? null;
  }

  let query = supabase.from('fulfillment_tasks').select('*').order('sort_order');

  if (agencyId) {
    query = query.eq('agency_id', agencyId);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}
