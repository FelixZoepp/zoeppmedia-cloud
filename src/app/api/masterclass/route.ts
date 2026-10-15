import { normalizeLesson } from '@/lib/masterclass/lesson';
import { bereichVon, fuehrungSchemaReady, hatFuehrungsZugang, type Bereich } from '@/lib/masterclass/bereich';
import { getCurrentUser } from '@/lib/auth';
import { istFreigegeben } from '@/lib/freigaben';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Masterclass-Übersicht. ?bereich=fuehrung → Masterclass für Führungskräfte (nur mit Freischaltung,
 * Fortschritt je Person), sonst die CEO-Masterclass (Fortschritt je Kunde).
 */
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const svc = createAdminClient();
  const bereich: Bereich = req.nextUrl.searchParams.get('bereich') === 'fuehrung' ? 'fuehrung' : 'ceo';
  const admin = user.role === 'admin';

  const [ready, fuehrungZugang, teaserFrei] = await Promise.all([fuehrungSchemaReady(svc), hatFuehrungsZugang(svc, user), istFreigegeben(svc, 'masterclass_fuehrung_teaser')]);
  if (bereich === 'fuehrung' && (!ready || !fuehrungZugang)) {
    return NextResponse.json({ error: 'Die Masterclass für Führungskräfte ist für dich noch nicht freigeschaltet' }, { status: 403 });
  }

  const [{ data: modulesRaw }, { data: lessons }] = await Promise.all([
    svc.from('masterclass_modules').select('*').eq('published', true).order('sort_order'),
    svc.from('masterclass_lessons').select('*, lesson_tasks(*)').order('sort_order'),
  ]);
  const modules = ((modulesRaw ?? []) as Array<Record<string, unknown> & { id: string; bereich?: unknown }>).filter((m) => bereichVon(m) === bereich);
  const modulIds = new Set(modules.map((m) => m.id));

  let lessonProgress: Record<string, boolean> = {};
  let taskProgress: Record<string, boolean> = {};
  if (bereich === 'fuehrung') {
    const [{ data: lp }, { data: tp }] = await Promise.all([
      svc.from('masterclass_user_progress').select('lesson_id, watched').eq('user_id', user.id),
      svc.from('masterclass_user_task_progress').select('task_id, completed').eq('user_id', user.id),
    ]);
    lessonProgress = Object.fromEntries(((lp ?? []) as Array<{ lesson_id: string; watched: boolean }>).map((p) => [p.lesson_id, p.watched]));
    taskProgress = Object.fromEntries(((tp ?? []) as Array<{ task_id: string; completed: boolean }>).map((p) => [p.task_id, p.completed]));
  } else if (user.agency_id) {
    const [{ data: lp }, { data: tp }] = await Promise.all([
      svc.from('agency_lesson_progress').select('lesson_id, watched').eq('agency_id', user.agency_id),
      svc.from('agency_task_progress').select('task_id, completed').eq('agency_id', user.agency_id),
    ]);
    lessonProgress = Object.fromEntries(((lp ?? []) as Array<{ lesson_id: string; watched: boolean }>).map((p) => [p.lesson_id, p.watched]));
    taskProgress = Object.fromEntries(((tp ?? []) as Array<{ task_id: string; completed: boolean }>).map((p) => [p.task_id, p.completed]));
  }

  // Entwürfe sehen nur Admins
  const visibleLessons = ((lessons ?? []) as Record<string, unknown>[])
    .filter((l) => modulIds.has(l.module_id as string))
    .filter((l) => admin || normalizeLesson(l).status === 'veroeffentlicht');

  return NextResponse.json({
    bereich,
    // Tab „Führungskräfte“ nur zeigen, wenn freigeschaltet
    fuehrung_zugang: ready && fuehrungZugang,
    // Teaser-Karte in der CEO-Masterclass, solange nicht freigeschaltet (Admins sehen sie zur Vorschau immer)
    fuehrung_teaser: bereich === 'ceo' && (admin || (teaserFrei && !(ready && fuehrungZugang))),
    modules,
    lessons: visibleLessons.map((l) => ({ ...l, ...normalizeLesson(l) })),
    lessonProgress,
    taskProgress,
  });
}
