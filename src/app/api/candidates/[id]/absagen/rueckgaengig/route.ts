import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { stageVonId } from '@/lib/pipeline/get-stages';
import { logActivity } from '@/lib/activity/log';
import { SCHNELL_ABSAGE_ART, mitProtokoll, pruefeUndo } from '@/lib/recruiting/schnell-absage';
import { ABSAGE_LEER } from '@/lib/recruiting/absagegruende';

/**
 * Schnell-Absage rückgängig: Phase, Bewerbungen, Gespräche und Termine wiederherstellen.
 * Anrufversuche und abgebrochene Jobs werden bewusst NICHT neu gestartet.
 * Body: { vorherStageId } oder die komplette Rückgängig-Antwort aus /absagen.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const profil = await getCurrentUser();
  if (!profil || !canWriteRole(profil.role)) return NextResponse.json({ error: 'Nur Lesezugriff' }, { status: 403 });

  const body = await request.json().catch(() => null);

  const { data: cand } = await supabase.from('candidates').select('id, agency_id').eq('id', id).maybeSingle();
  const candidate = cand as { id: string; agency_id: string } | null;
  if (!candidate) return NextResponse.json({ error: 'Bewerber nicht gefunden.' }, { status: 404 });
  const agencyId = candidate.agency_id;
  const svc = createAdminClient();

  // Ohne vollständige Daten: letzte Schnell-Absage aus dem Protokoll
  const { data: log } = await svc
    .from('activity_log')
    .select('metadata')
    .eq('candidate_id', id)
    .eq('agency_id', agencyId)
    .eq('metadata->>art', SCHNELL_ABSAGE_ART)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const protokoll = pruefeUndo((log as { metadata?: { rueckgaengig?: unknown } } | null)?.metadata?.rueckgaengig);
  const undo = mitProtokoll(pruefeUndo(body), protokoll);
  if (!undo) return NextResponse.json({ error: 'Nichts zum Rückgängigmachen.' }, { status: 400 });

  const stage = await stageVonId(svc, undo.vorherStageId, agencyId);
  const jetzt = new Date().toISOString();

  // 1. Phase zurück (RLS prüft Schreibrecht)
  const update: Record<string, unknown> = { current_stage_id: stage?.id ?? null };
  // Von der Absage gesetzter Grund → wieder leeren, damit er nicht mehr in der Auswertung zählt
  if (undo.grundGesetzt) Object.assign(update, ABSAGE_LEER);
  const { data: updated, error } = await supabase.from('candidates').update(update).eq('id', id).select('id');
  if (error) return NextResponse.json({ error: 'Update fehlgeschlagen.' }, { status: 500 });
  if (!updated?.length) return NextResponse.json({ error: 'Kein Zugriff auf diesen Bewerber.' }, { status: 403 });
  if (stage) await supabase.from('candidate_stages').insert({ candidate_id: id, stage_id: stage.id, changed_by: user.id });

  // 2. Bewerbungen: gemerkten Zustand, sonst vorherige Phase + offen
  if (undo.bewerbungen.length) {
    for (const b of undo.bewerbungen) {
      await supabase
        .from('applications')
        .update({ stage_id: b.stage_id ?? stage?.id ?? null, status: b.status, updated_at: jetzt })
        .eq('id', b.id)
        .eq('candidate_id', id)
        .eq('agency_id', agencyId);
    }
  } else {
    await supabase
      .from('applications')
      .update({ stage_id: stage?.id ?? null, status: 'open', updated_at: jetzt })
      .eq('candidate_id', id)
      .eq('agency_id', agencyId);
  }

  // 3. Gespräche wieder öffnen – nur die, die noch geschlossen sind
  for (const g of undo.gespraeche) {
    await svc.from('conversations').update({ state: g.state, updated_at: jetzt }).eq('id', g.id).eq('candidate_id', id).eq('agency_id', agencyId).eq('state', 'closed');
  }

  // 4. Termine wiederherstellen (Erinnerungs-Jobs bleiben abgebrochen)
  for (const t of undo.termine) {
    await svc.from('candidate_appointments').update({ status: t.status }).eq('id', t.id).eq('candidate_id', id).eq('agency_id', agencyId).eq('status', 'abgesagt');
  }
  if (undo.einladungen.length) {
    const { data: apps } = await svc.from('applications').select('id').eq('candidate_id', id).eq('agency_id', agencyId);
    const appIds = ((apps ?? []) as Array<{ id: string }>).map((a) => a.id);
    for (const e of appIds.length ? undo.einladungen : []) {
      await svc.from('appointments').update({ status: e.status, updated_at: jetzt }).eq('id', e.id).eq('agency_id', agencyId).in('application_id', appIds).eq('status', 'cancelled');
    }
  }

  await logActivity(supabase, {
    agency_id: agencyId,
    user_id: user.id,
    candidate_id: id,
    action: 'Schnell-Absage rückgängig gemacht',
    action_type: 'other',
    metadata: { art: `${SCHNELL_ABSAGE_ART}_rueckgaengig`, stage_id: stage?.id ?? null },
  });

  return NextResponse.json({ ok: true, stageId: stage?.id ?? null });
}
