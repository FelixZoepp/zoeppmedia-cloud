import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { text } = await request.json();

  if (!text?.trim()) {
    return NextResponse.json({ error: 'Notiz darf nicht leer sein.' }, { status: 400 });
  }

  const { data: note, error } = await supabase
    .from('notes')
    .insert({ candidate_id: id, user_id: user.id, text: text.trim() })
    .select('*, user:users(name)')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Notiz konnte nicht gespeichert werden.' }, { status: 500 });
  }

  return NextResponse.json(note, { status: 201 });
}
