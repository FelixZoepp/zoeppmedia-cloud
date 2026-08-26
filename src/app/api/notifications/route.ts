import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const unreadOnly = searchParams.get('unread_only') === 'true';
  const limit = Math.min(parseInt(searchParams.get('limit') || '20', 10), 100);

  let query = supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (unreadOnly) {
    query = query.eq('read', false);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Get unread count separately
  const { count } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('read', false);

  return NextResponse.json({ notifications: data ?? [], unread_count: count ?? 0 });
}

export async function PATCH(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const now = new Date().toISOString();

  if (body.all === true) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: now })
      .eq('user_id', user.id)
      .eq('read', false);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  if (Array.isArray(body.ids) && body.ids.length > 0) {
    const { error } = await supabase
      .from('notifications')
      .update({ read: true, read_at: now })
      .eq('user_id', user.id)
      .in('id', body.ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: 'Provide ids array or all: true' }, { status: 400 });
}
