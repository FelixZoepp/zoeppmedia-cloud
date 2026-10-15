import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { mindestSekunden, pruefeSehnachweis } from '@/lib/masterclass/sehnachweis';

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

  const { type, id, value, sehnachweis, video_sekunden } = await req.json();

  // Video erst abhaken, wenn es angeschaut wurde (seit dem Öffnen mind. Videodauer vergangen)
  if (type === 'lesson' && value === true) {
    const { data: lesson } = await createAdminClient().from('masterclass_lessons').select('*').eq('id', id).maybeSingle();
    const l = lesson as { typ: string | null; video_url: string | null; duration_minutes: number | null } | null;
    if (l && (l.typ ?? 'video') === 'video' && l.video_url) {
      const geoeffnet = pruefeSehnachweis(sehnachweis, id, user.id);
      const noetig = mindestSekunden(l.duration_minutes, video_sekunden);
      if (geoeffnet === null || (Date.now() - geoeffnet) / 1000 < noetig) {
        return NextResponse.json({ error: 'Bitte schau dir das Video erst vollständig an.' }, { status: 409 });
      }
    }
  }

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
