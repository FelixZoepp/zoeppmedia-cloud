import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSatisfaction, type SurveyRow } from '@/lib/surveys/analytics';

/** Zufriedenheit: Durchschnitte gesamt, je Kunde, je Betreuer, je Frage, Verlauf (6 Monate). */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const svc = createAdminClient();

  const [{ data: responses }, { data: agencies }, { data: users }, { data: templates }] = await Promise.all([
    svc.from('survey_responses').select('agency_id, rating, answers, created_at, template_id').order('created_at', { ascending: false }),
    svc.from('agencies').select('id, name, csm_user_id'),
    svc.from('users').select('id, name').in('role', ['admin', 'employee']),
    svc.from('survey_templates').select('questions'),
  ]);

  const labels = new Map<string, string>();
  for (const t of (templates ?? []) as Array<{ questions: Array<{ id: string; label: string }> | null }>) {
    for (const q of t.questions ?? []) if (q?.id && q?.label) labels.set(q.id, q.label);
  }

  const stats = computeSatisfaction(
    (responses ?? []) as SurveyRow[],
    new Map(((agencies ?? []) as Array<{ id: string; name: string; csm_user_id: string | null }>).map((a) => [a.id, { name: a.name, csm_user_id: a.csm_user_id }])),
    new Map(((users ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name])),
    labels,
  );

  return NextResponse.json({
    ...stats,
    // Abwärtskompatibel zu älteren Aufrufern
    avgRating: stats.gesamt.schnitt ?? 0,
    total: stats.gesamt.anzahl,
    belowThreshold: stats.kritisch.map((k) => ({ agency_id: k.agency_id, name: k.name, avgRating: k.schnitt })),
    trend: stats.verlauf.map((v) => ({ month: v.monat, avg: v.schnitt ?? 0 })),
  });
}
