import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Admin only' }, { status: 403 });

  const { value } = await request.json();
  if (typeof value !== 'number') return NextResponse.json({ error: 'Value must be a number' }, { status: 400 });

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('kpi_defaults')
    .update({ default_value: value, updated_at: new Date().toISOString() })
    .eq('kpi_key', key)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
