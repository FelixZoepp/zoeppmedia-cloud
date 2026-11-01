import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { stageVomTyp, getStagesForAgency } from '@/lib/pipeline/get-stages';
import { stoppeAbgesagtenBewerber } from '@/lib/recruiting/absage-stopp';
import { fireEvent } from '@/lib/automations/fire';
import { logActivity } from '@/lib/activity/log';
import { absageFelder, pruefeAbsage } from '@/lib/recruiting/absagegruende';
import { SCHNELL_ABSAGE_ART, baueUndo, istAbgesagtStage } from '@/lib/recruiting/schnell-absage';

/**
 * Absage: Bewerber in „Abgesagt“ schieben und alles stoppen, was ihn noch kontaktieren würde
 * (Anrufversuche, KI-Agent, geplante Jobs, künftige Termine). Bewerber bekommt KEINE Nachricht.
 * Body: { code, notiz? } – Grund aus dem Katalog ist Pflicht (Auswertung „Absagegründe“).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profil = await getCurrentUser();
  if (!profil || !canWriteRole(profil.role)) return NextResponse.json({ error: 'Nur Lesezugriff' }, { status: 403 });

  const grund = pruefeAbsage(await request.json().catch(() => null));
  if ('fehler' in grund) return NextResponse.json({ error: grund.fehler }, { status: 400 });

  // RLS: nur sichtbare Bewerber
  const { data: cand } = await supabase
    .from('candidates')
    .select('id, agency_id, current_stage_id, cadence_active')
    .eq('id', id)
    .maybeSingle();
  const candidate = cand as { id: string; agency_id: string; current_stage_id: string | null; cadence_active: boolean | null } | null;
  if (!candidate) return NextResponse.json({ error: 'Bewerber nicht gefunden.' }, { status: 404 });
  const agencyId = candidate.agency_id;

  const svc = createAdminClient();
  const stages = await getStagesForAgency(svc, agencyId);
  const ziel = (await stageVomTyp(svc, agencyId, ['rejected'])) ?? stages.find((s) => /^abgesagt/i.test(s.name)) ?? null;
  if (!ziel) return NextResponse.json({ error: 'Keine Phase „Abgesagt“ eingerichtet.' }, { status: 409 });
  const aktuell = stages.find((s) => s.id === candidate.current_stage_id);
  if (candidate.current_stage_id === ziel.id || istAbgesagtStage(aktuell)) {
    return NextResponse.json({ error: 'Bewerber ist bereits abgesagt.' }, { status: 409 });
  }

  // Vorher-Zustand der Bewerbungen merken (für Rückgängig)
  const { data: apps } = await supabase.from('applications').select('id, stage_id, status').eq('candidate_id', id).eq('agency_id', agencyId);
  const bewerbungen = (apps ?? []) as Array<{ id: string; stage_id: string | null; status: string | null }>;
  const jetzt = new Date().toISOString();

  // Grund wird immer gesetzt → beim Rückgängigmachen wieder leeren
  const grundGesetzt = true;

  // 1. Phase + Absagegrund setzen – RLS entscheidet über Schreibrecht (0 Zeilen = kein Zugriff)
  const update: Record<string, unknown> = {
    current_stage_id: ziel.id,
    ...absageFelder({ code: grund.code, notiz: grund.notiz, userId: user.id, phaseId: candidate.current_stage_id, jetzt }),
  };
  const { data: updated, error: updateError } = await supabase.from('candidates').update(update).eq('id', id).select('id');
  if (updateError) return NextResponse.json({ error: 'Update fehlgeschlagen.' }, { status: 500 });
  if (!updated?.length) return NextResponse.json({ error: 'Kein Zugriff auf diesen Bewerber.' }, { status: 403 });

  await supabase.from('candidate_stages').insert({ candidate_id: id, stage_id: ziel.id, changed_by: user.id });
  await supabase
    .from('applications')
    .update({ stage_id: ziel.id, status: 'rejected', updated_at: jetzt })
    .eq('candidate_id', id)
    .eq('agency_id', agencyId);

  // 2.–5. Anrufversuche, KI-Agent, geplante Jobs und künftige Termine stoppen (gemeinsam mit den Stufen-Routen)
  const { gespraeche, termine, einladungen, gestoppt } = await stoppeAbgesagtenBewerber(svc, {
    candidateId: id,
    agencyId,
    applicationIds: bewerbungen.map((a) => a.id),
    cadenceActive: candidate.cadence_active,
    jetzt,
  });

  const rueckgaengig = baueUndo({ vorherStageId: candidate.current_stage_id, grundGesetzt, bewerbungen, gespraeche, termine, einladungen });

  await logActivity(supabase, {
    agency_id: agencyId,
    user_id: user.id,
    candidate_id: id,
    action: `Bewerber abgesagt: ${update.ablehngrund as string}`,
    action_type: 'other',
    metadata: { art: SCHNELL_ABSAGE_ART, stage_id: ziel.id, absage_code: grund.code, absage_notiz: grund.notiz, rueckgaengig, gestoppt },
  });

  fireEvent('stage_changed', agencyId, { candidate_id: id, extra: { new_stage_id: ziel.id, schnell_absage: true } }).catch(() => {});

  return NextResponse.json({ ok: true, stageId: ziel.id, vorherStageId: candidate.current_stage_id, rueckgaengig, gestoppt });
}
