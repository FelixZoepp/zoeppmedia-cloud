import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError) return NextResponse.json({ error: 'auth_error', detail: authError.message });
  if (!user) return NextResponse.json({ error: 'no_auth_user' });

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', user.id)
    .single();

  return NextResponse.json({
    auth_user_id: user.id,
    auth_email: user.email,
    profile,
    profile_error: profileError?.message || null,
  });
}
