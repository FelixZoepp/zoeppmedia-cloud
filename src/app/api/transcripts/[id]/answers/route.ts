import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('transcript_answers')
    .select('*')
    .eq('transcript_id', id)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json();
  const { answer_id, status, korrigierter_wert } = body;

  if (!answer_id || !status) {
    return NextResponse.json({ error: 'answer_id und status sind erforderlich' }, { status: 400 });
  }

  // Verify the answer belongs to this transcript
  const { data: answer } = await supabase
    .from('transcript_answers')
    .select('id, transcript_id')
    .eq('id', answer_id)
    .eq('transcript_id', id)
    .single();

  if (!answer) {
    return NextResponse.json({ error: 'Antwort nicht gefunden' }, { status: 404 });
  }

  const updateData: Record<string, unknown> = {
    status,
    geprueft_von: user.id,
    geprueft_am: new Date().toISOString(),
  };

  if (korrigierter_wert !== undefined) {
    updateData.korrigierter_wert = korrigierter_wert;
  }

  const { data: updated, error } = await supabase
    .from('transcript_answers')
    .update(updateData)
    .eq('id', answer_id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(updated);
}
