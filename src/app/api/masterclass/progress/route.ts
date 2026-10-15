import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { mindestSekunden, pruefeSehnachweis } from '@/lib/masterclass/sehnachweis';
import { bereichVon, hatFuehrungsZugang } from '@/lib/masterclass/bereich';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { type, id, value, sehnachweis, video_sekunden } = await req.json();
  if ((type !== 'lesson' && type !== 'task') || typeof id !== 'string' || typeof value !== 'boolean') {
    return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  }
  const svc = createAdminClient();

  // Zu welcher Lektion gehört der Eintrag, und in welcher Masterclass liegt sie?
  let lessonId = id;
  if (type === 'task') {
    const { data: t } = await svc.from('lesson_tasks').select('lesson_id').eq('id', id).maybeSingle();
    if (!t) return NextResponse.json({ error: 'Aufgabe nicht gefunden' }, { status: 404 });
    lessonId = (t as { lesson_id: string }).lesson_id;
  }
  const { data: lesson } = await svc.from('masterclass_lessons').select('*').eq('id', lessonId).maybeSingle();
  if (!lesson) return NextResponse.json({ error: 'Lektion nicht gefunden' }, { status: 404 });
  const l = lesson as { module_id: string; typ: string | null; video_url: string | null; duration_minutes: number | null };
  const { data: mod } = await svc.from('masterclass_modules').select('*').eq('id', l.module_id).maybeSingle();
  const fuehrung = bereichVon(mod as { bereich?: unknown } | null) === 'fuehrung';

  if (fuehrung && !(await hatFuehrungsZugang(svc, user))) {
    return NextResponse.json({ error: 'Die Masterclass für Führungskräfte ist für dich noch nicht freigeschaltet' }, { status: 403 });
  }
  if (!fuehrung && !user.agency_id) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  // Video erst abhaken, wenn es angeschaut wurde (seit dem Öffnen mind. Videodauer vergangen)
  if (type === 'lesson' && value && (l.typ ?? 'video') === 'video' && l.video_url) {
    const geoeffnet = pruefeSehnachweis(sehnachweis, id, user.id);
    const noetig = mindestSekunden(l.duration_minutes, video_sekunden);
    if (geoeffnet === null || (Date.now() - geoeffnet) / 1000 < noetig) {
      return NextResponse.json({ error: 'Bitte schau dir das Video erst vollständig an.' }, { status: 409 });
    }
  }

  const completed_at = value ? new Date().toISOString() : null;
  let error: { message: string } | null = null;
  if (fuehrung) {
    // Führungskräfte: Fortschritt je Person
    ({ error } =
      type === 'lesson'
        ? await svc.from('masterclass_user_progress').upsert({ user_id: user.id, lesson_id: id, watched: value, completed_at }, { onConflict: 'user_id,lesson_id' })
        : await svc.from('masterclass_user_task_progress').upsert({ user_id: user.id, task_id: id, completed: value, completed_at }, { onConflict: 'user_id,task_id' }));
  } else {
    ({ error } =
      type === 'lesson'
        ? await supabase.from('agency_lesson_progress').upsert({ agency_id: user.agency_id, lesson_id: id, watched: value, completed_at }, { onConflict: 'agency_id,lesson_id' })
        : await supabase.from('agency_task_progress').upsert({ agency_id: user.agency_id, task_id: id, completed: value, completed_at }, { onConflict: 'agency_id,task_id' }));
  }
  if (error) return NextResponse.json({ error: 'Fortschritt konnte nicht gespeichert werden' }, { status: 500 });

  return NextResponse.json({ ok: true });
}
