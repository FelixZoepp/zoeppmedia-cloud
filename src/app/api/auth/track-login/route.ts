import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { logActivity } from '@/lib/activity/log';

export async function POST(req: NextRequest) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single();

  const agency_id = profile?.agency_id ?? null;
  const ip_address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const user_agent = req.headers.get('user-agent') ?? null;

  const admin = createAdminClient();

  // Insert login history record
  await admin.from('login_history').insert({
    user_id: user.id,
    agency_id,
    ip_address,
    user_agent,
  });

  // Log activity
  await logActivity(admin, {
    agency_id,
    user_id: user.id,
    action: 'Eingeloggt',
    action_type: 'login',
    metadata: { ip_address, user_agent },
  });

  // Update last_login on users table
  await admin
    .from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('id', user.id);

  return NextResponse.json({ ok: true });
}
