import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single();
  if (!profile?.agency_id) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const { type, id, value } = await req.json();

  if (type === 'lesson') {
    await supabase.from('agency_lesson_progress').upsert({
      agency_id: profile.agency_id,
      lesson_id: id,
      watched: value,
      completed_at: value ? new Date().toISOString() : null,
    }, { onConflict: 'agency_id,lesson_id' });
  } else if (type === 'task') {
    await supabase.from('agency_task_progress').upsert({
      agency_id: profile.agency_id,
      task_id: id,
      completed: value,
      completed_at: value ? new Date().toISOString() : null,
    }, { onConflict: 'agency_id,task_id' });
  }

  return NextResponse.json({ ok: true });
}
