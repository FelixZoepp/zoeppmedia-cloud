import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single();
  if (!profile || profile.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { action, ...payload } = await req.json();

  if (action === 'create_module') {
    const { data, error } = await supabase
      .from('masterclass_modules')
      .insert(payload)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'create_lesson') {
    const { data, error } = await supabase
      .from('masterclass_lessons')
      .insert(payload)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'create_lesson_task') {
    const { data, error } = await supabase
      .from('lesson_tasks')
      .insert(payload)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'update_module') {
    const { id, ...fields } = payload;
    const { data, error } = await supabase
      .from('masterclass_modules')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'update_lesson') {
    const { id, ...fields } = payload;
    const { data, error } = await supabase
      .from('masterclass_lessons')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  }

  if (action === 'delete_module') {
    await supabase.from('masterclass_modules').delete().eq('id', payload.id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'delete_lesson') {
    await supabase.from('masterclass_lessons').delete().eq('id', payload.id);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
