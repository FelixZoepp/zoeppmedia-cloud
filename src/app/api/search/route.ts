import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, isInternal } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const q = request.nextUrl.searchParams.get('q') ?? '';
  if (!q.trim()) {
    return NextResponse.json({ agencies: [], candidates: [], users: [] });
  }

  const supabase = await createServerClient();
  const pattern = `%${q}%`;

  const [agenciesRes, candidatesRes, usersRes] = await Promise.all([
    supabase
      .from('agencies')
      .select('id, name, email')
      .or(`name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(5),
    supabase
      .from('candidates')
      .select('id, name, email, phone, agency_id')
      .or(`name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern}`)
      .limit(5),
    supabase
      .from('users')
      .select('id, name, email, role')
      .or(`name.ilike.${pattern},email.ilike.${pattern}`)
      .limit(5),
  ]);

  return NextResponse.json({
    agencies: agenciesRes.data ?? [],
    candidates: candidatesRes.data ?? [],
    users: usersRes.data ?? [],
  });
}
