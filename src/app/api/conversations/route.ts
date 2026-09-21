import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  // R7: return 403 instead of empty array
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const filter = request.nextUrl.searchParams.get('filter') || 'all';
  const search = request.nextUrl.searchParams.get('search') || '';

  const svc = createAdminClient();
  let query = svc
    .from('conversations')
    .select(`
      id, state, window_expires_at, unread_count, last_message_at, assigned_to,
      candidate:candidates!inner(id, name, phone_e164, email),
      application:applications(id, job:jobs(title), stage:pipeline_stages(name, color))
    `)
    .eq('agency_id', agencyId)
    .order('last_message_at', { ascending: false });

  // Filter
  switch (filter) {
    case 'mine':
      query = query.eq('assigned_to', user.id);
      break;
    case 'unassigned':
      query = query.is('assigned_to', null);
      break;
    case 'unread':
      query = query.gt('unread_count', 0);
      break;
    case 'expiring': {
      const twoHours = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
      query = query.lt('window_expires_at', twoHours).gt('window_expires_at', new Date().toISOString());
      break;
    }
  }

  // Suche
  if (search) {
    query = query.or(`candidate.name.ilike.%${search}%,candidate.phone_e164.ilike.%${search}%`);
  }

  const { data, error } = await query.limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data || []);
}
