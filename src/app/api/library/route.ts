import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get('agency_id');
  const contentType = searchParams.get('content_type');
  const status = searchParams.get('status');

  let query = supabase.from('content_library').select('*').order('created_at', { ascending: false });
  if (agencyId) query = query.eq('agency_id', agencyId);
  if (contentType) query = query.eq('content_type', contentType);
  if (status) {
    // Support comma-separated list of statuses, e.g. status=approved_internal,client_review
    const statuses = status.split(',').map((s) => s.trim()).filter(Boolean);
    if (statuses.length === 1) {
      query = query.eq('status', statuses[0]);
    } else if (statuses.length > 1) {
      query = query.in('status', statuses);
    }
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

  const body = await req.json();
  const { agency_id, content_type, title, content, variant } = body;

  const insertData = {
    agency_id,
    content_type,
    title,
    content,
    variant: variant ?? null,
    version: 1,
    status: 'draft' as const,
    created_by: user.id,
  };

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('content_library')
    .insert(insertData)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
