import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('playbook_entries')
    .select('*')
    .eq('problem_key', key)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json();
  const supabase = await createServerClient();

  const { data, error } = await supabase
    .from('playbook_entries')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('problem_key', key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
