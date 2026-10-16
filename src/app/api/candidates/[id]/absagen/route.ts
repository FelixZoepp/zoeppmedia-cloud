import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { stageVomTyp, getStagesForAgency } from '@/lib/pipeline/get-stages';
import { stopCadence } from '@/lib/cadence/engine';
import { fireEvent } from '@/lib/automations/fire';
import { logActivity } from '@/lib/activity/log';
import {
  SCHNELL_ABSAGE_ART,
  SCHNELL_ABSAGE_GRUND,
  baueUndo,
  istAbgesagtStage,
  jobFilterOr,
  sollJobAbbrechen,
} from '@/lib/recruiting/schnell-absage';

/**
 * Schnell-Absage: Bewerber in „Abgesagt“ schieben und alles stoppen, was ihn noch kontaktieren würde
 * (Anrufversuche, KI-Agent, geplante Jobs, künftige Termine). Bewerber bekommt KEINE Nachricht.
 */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profil = await getCurrentUser();
  if (!profil || !canWriteRole(profil.role)) return NextResponse.json({ error: 'Nur Lesezugriff' }, { status: 403 });

  // RLS: nur sichtbare Bewerber
  const { data: cand } = await supabase
    .from('candidates')
    .select('id, agency_id, current_stage_id, ablehngrund, cadence_active')
    .eq('id', id)
    .maybeSingle();
  const candidate = cand as { id: string; agency_id: string; current_stage_id: string | null; ablehngrund: string | null; cadence_active: boolean | null } | null;
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

  // Vorher-Zustand merken (für Rückgängig)
  const [{ data: apps }, { data: convs }] = await Promise.all([
    supabase.from('applications').select('id, stage_id, status').eq('candidate_id', id).eq('agency_id', agencyId),
    svc.from('conversations').select('id, state').eq('candidate_id', id).eq('agency_id', agencyId),
  ]);
  const bewerbungen = (apps ?? []) as Array<{ id: string; stage_id: string | null; status: string | null }>;
  const gespraeche = (convs ?? []) as Array<{ id: string; state: string | null }>;
  const jetzt = new Date().toISOString();
  const [{ data: ca }, { data: ap }] = await Promise.all([
    svc.from('candidate_appointments').select('id, status').eq('candidate_id', id).eq('agency_id', agencyId).eq('status', 'geplant').gte('scheduled_at', jetzt),
    bewerbungen.length
      ? svc.from('appointments').select('id, status, starts_at').eq('agency_id', agencyId).in('application_id', bewerbungen.map((a) => a.id)).in('status', ['proposed', 'booked', 'confirmed'])
      : Promise.resolve({ data: [] }),
  ]);
  const termine = (ca ?? []) as Array<{ id: string; status: string | null }>;
  // Einladungen ohne Zeit (noch nicht gebucht) oder in der Zukunft
  const einladungen = ((ap ?? []) as Array<{ id: string; status: string | null; starts_at: string | null }>).filter((a) => !a.starts_at || a.starts_at >= jetzt);

  const grundGesetzt = !candidate.ablehngrund?.trim();

  // 1. Phase setzen – RLS entscheidet über Schreibrecht (0 Zeilen = kein Zugriff)
  const update: Record<string, unknown> = { current_stage_id: ziel.id };
  if (grundGesetzt) update.ablehngrund = SCHNELL_ABSAGE_GRUND;
  const { data: updated, error: updateError } = await supabase.from('candidates').update(update).eq('id', id).select('id');
  if (updateError) return NextResponse.json({ error: 'Update fehlgeschlagen.' }, { status: 500 });
  if (!updated?.length) return NextResponse.json({ error: 'Kein Zugriff auf diesen Bewerber.' }, { status: 403 });

  await supabase.from('candidate_stages').insert({ candidate_id: id, stage_id: ziel.id, changed_by: user.id });
  await supabase
    .from('applications')
    .update({ stage_id: ziel.id, status: 'rejected', updated_at: jetzt })
    .eq('candidate_id', id)
    .eq('agency_id', agencyId);

  // 2. Anrufversuche stoppen
  const anrufeGestoppt = !!candidate.cadence_active;
  if (anrufeGestoppt) await stopCadence(svc, id, 'abgesagt');

  // 3. Gespräche schließen → KI-Agent antwortet nicht mehr
  const offeneGespraeche = gespraeche.filter((g) => g.state !== 'closed').map((g) => g.id);
  if (offeneGespraeche.length) {
    await svc.from('conversations').update({ state: 'closed', updated_at: jetzt }).eq('agency_id', agencyId).in('id', offeneGespraeche);
  }

  // 4. Geplante Jobs (Bot-Timer, Nachfass-WhatsApp, Erinnerungen …) abbrechen
  const bezug = {
    candidateId: id,
    conversationIds: gespraeche.map((g) => g.id),
    applicationIds: bewerbungen.map((a) => a.id),
    appointmentIds: [...termine.map((t) => t.id), ...einladungen.map((e) => e.id)],
  };
  const { data: jobs } = await svc
    .from('scheduled_jobs')
    .select('id, type, payload')
    .eq('agency_id', agencyId)
    .eq('status', 'pending')
    .or(jobFilterOr(bezug))
    .limit(500);
  const jobIds = ((jobs ?? []) as Array<{ id: string; type: string; payload: unknown }>).filter((j) => sollJobAbbrechen(j, bezug)).map((j) => j.id);
  if (jobIds.length) {
    await svc.from('scheduled_jobs').update({ status: 'cancelled', updated_at: jetzt }).in('id', jobIds).eq('status', 'pending');
  }

  // 5. Künftige Termine direkt absagen – bewusst NICHT über cancelAppointment / Termin-PATCH (die schicken Mail bzw. lösen Automationen aus)
  if (termine.length) {
    await svc.from('candidate_appointments').update({ status: 'abgesagt' }).eq('agency_id', agencyId).in('id', termine.map((t) => t.id));
  }
  if (einladungen.length) {
    await svc.from('appointments').update({ status: 'cancelled', updated_at: jetzt }).eq('agency_id', agencyId).in('id', einladungen.map((e) => e.id));
  }

  const rueckgaengig = baueUndo({ vorherStageId: candidate.current_stage_id, grundGesetzt, bewerbungen, gespraeche, termine, einladungen });
  const gestoppt = { anrufe: anrufeGestoppt, gespraeche: offeneGespraeche.length, jobs: jobIds.length, termine: termine.length + einladungen.length };

  await logActivity(supabase, {
    agency_id: agencyId,
    user_id: user.id,
    candidate_id: id,
    action: 'Bewerber abgesagt (Schnell-Absage)',
    action_type: 'other',
    metadata: { art: SCHNELL_ABSAGE_ART, stage_id: ziel.id, rueckgaengig, gestoppt },
  });

  fireEvent('stage_changed', agencyId, { candidate_id: id, extra: { new_stage_id: ziel.id, schnell_absage: true } }).catch(() => {});

  return NextResponse.json({ ok: true, stageId: ziel.id, vorherStageId: candidate.current_stage_id, rueckgaengig, gestoppt });
}
