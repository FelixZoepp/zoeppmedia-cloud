import { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationForAgency } from '@/lib/notifications/create';

interface Module {
  id: string;
  title: string;
  sort_order: number;
}

interface Lesson {
  id: string;
  module_id: string;
}

interface Agency {
  id: string;
  onboarding_completed: boolean;
  created_at: string;
}

/**
 * Check all onboarded agencies for overdue masterclass modules
 * and send nudge notifications where appropriate.
 *
 * Designed to run inside a daily cron job.
 */
export async function checkMasterclassNudges(supabase: SupabaseClient) {
  // 1. Get all onboarded agencies
  const { data: agencies } = await supabase
    .from('agencies')
    .select('id, onboarding_completed, created_at')
    .eq('onboarding_completed', true);

  if (!agencies?.length) return { sent: 0 };

  // 2. Load modules and lessons once
  const { data: modules } = await supabase
    .from('masterclass_modules')
    .select('id, title, sort_order')
    .eq('published', true)
    .order('sort_order');

  const { data: allLessons } = await supabase
    .from('masterclass_lessons')
    .select('id, module_id')
    .order('sort_order');

  if (!modules?.length || !allLessons?.length) return { sent: 0 };

  // Build module lookup
  const module2 = modules.find((m: Module) => m.sort_order === 2);
  const module7 = modules.find((m: Module) => m.sort_order === 7);

  let totalSent = 0;

  for (const agency of agencies as Agency[]) {
    const agencyId = agency.id;
    const onboardedAt = new Date(agency.created_at);
    const daysSinceOnboarding = Math.floor(
      (Date.now() - onboardedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Get all lesson progress for this agency
    const { data: progress } = await supabase
      .from('agency_lesson_progress')
      .select('lesson_id, watched')
      .eq('agency_id', agencyId);

    const watchedSet = new Set(
      (progress ?? [])
        .filter((p: { lesson_id: string; watched: boolean }) => p.watched)
        .map((p: { lesson_id: string; watched: boolean }) => p.lesson_id)
    );

    // Get already-sent nudges for this agency
    const { data: sentNudges } = await supabase
      .from('masterclass_nudges')
      .select('lesson_id, nudge_type')
      .eq('agency_id', agencyId);

    const nudgeKeys = new Set(
      (sentNudges ?? []).map(
        (n: { lesson_id: string; nudge_type: string }) => `${n.lesson_id}:${n.nudge_type}`
      )
    );

    // Helper: check if all lessons of a module are watched
    function isModuleComplete(moduleId: string): boolean {
      const moduleLessons = (allLessons as Lesson[]).filter(
        (l) => l.module_id === moduleId
      );
      return moduleLessons.length > 0 && moduleLessons.every((l) => watchedSet.has(l.id));
    }

    // Helper: send a nudge if not already sent
    async function sendNudge(
      moduleId: string,
      lessonId: string,
      nudgeType: 'reminder' | 'overdue' | 'milestone',
      title: string,
      body: string
    ) {
      const key = `${lessonId}:${nudgeType}`;
      if (nudgeKeys.has(key)) return;

      // Record nudge to avoid duplicates
      const { error } = await supabase.from('masterclass_nudges').insert({
        agency_id: agencyId,
        lesson_id: lessonId,
        nudge_type: nudgeType,
      });

      // If insert fails (e.g. unique constraint), skip silently
      if (error) return;

      await createNotificationForAgency(supabase, agencyId, {
        title,
        body,
        type: 'system',
        entity_type: 'agency',
        entity_id: agencyId,
      });

      totalSent++;
    }

    // --- Module 2: "Die ersten 60 Minuten" ---
    // If not completed after 10 days since onboarding
    if (module2 && daysSinceOnboarding >= 10 && !isModuleComplete(module2.id)) {
      const firstLessonOfModule = (allLessons as Lesson[]).find(
        (l) => l.module_id === module2.id
      );
      if (firstLessonOfModule) {
        await sendNudge(
          module2.id,
          firstLessonOfModule.id,
          'overdue',
          `Modul "${module2.title}" wartet auf dich`,
          `Modul 2 "${module2.title}" hilft dir, Bewerber schneller zu erreichen. Schau es dir an, wenn du einen Moment hast.`
        );
      }
    }

    // --- Module 7: "Status richtig pflegen" ---
    // If not completed after 14 days since onboarding
    if (module7 && daysSinceOnboarding >= 14 && !isModuleComplete(module7.id)) {
      const firstLessonOfModule = (allLessons as Lesson[]).find(
        (l) => l.module_id === module7.id
      );
      if (firstLessonOfModule) {
        await sendNudge(
          module7.id,
          firstLessonOfModule.id,
          'overdue',
          `Modul "${module7.title}" ist wichtig für dein Dashboard`,
          `Modul 7 "${module7.title}" ist wichtig für deine Zahlen im Dashboard. Es dauert nur wenige Minuten.`
        );
      }
    }

    // --- Module 3: Trigger = first candidate exists ---
    const module3 = modules.find((m: Module) => m.sort_order === 3);
    if (module3 && !isModuleComplete(module3.id)) {
      const { count: candidateCount } = await supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId);

      if (candidateCount && candidateCount > 0) {
        const firstLessonOfModule = (allLessons as Lesson[]).find(
          (l) => l.module_id === module3.id
        );
        if (firstLessonOfModule) {
          await sendNudge(
            module3.id,
            firstLessonOfModule.id,
            'reminder',
            `Dein erster Bewerber ist da — Modul "${module3.title}" hilft dir weiter`,
            `Du hast deinen ersten Bewerber erhalten. Modul 3 "${module3.title}" zeigt dir die nächsten Schritte.`
          );
        }
      }
    }

    // --- Module 4: Trigger = first interview/termin ---
    const module4 = modules.find((m: Module) => m.sort_order === 4);
    if (module4 && !isModuleComplete(module4.id)) {
      const { count: terminCount } = await supabase
        .from('call_logs')
        .select('*', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .eq('result', 'termin_vereinbart');

      if (terminCount && terminCount > 0) {
        const firstLessonOfModule = (allLessons as Lesson[]).find(
          (l) => l.module_id === module4.id
        );
        if (firstLessonOfModule) {
          await sendNudge(
            module4.id,
            firstLessonOfModule.id,
            'reminder',
            `Erster Termin vereinbart — Modul "${module4.title}" vorbereiten`,
            `Du hast deinen ersten Termin vereinbart. Modul 4 "${module4.title}" hilft dir bei der Vorbereitung.`
          );
        }
      }
    }
  }

  return { sent: totalSent };
}
