import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { fireEvent } from '@/lib/automations/fire';
import { absageAusBody, absageFelder, ABSAGE_LEER } from '@/lib/recruiting/absagegruende';
import { istAbgesagtStage, istEingestelltStage, stoppeAbgesagtenBewerber } from '@/lib/recruiting/absage-stopp';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // agency_viewer = nur lesen
  const profil = await getCurrentUser();
  if (!profil || !canWriteRole(profil.role)) return NextResponse.json({ error: 'Nur Lesezugriff' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const { stage_id } = body as { stage_id?: string };

  if (!stage_id) {
    return NextResponse.json({ error: 'stage_id erforderlich.' }, { status: 400 });
  }

  // Ziel „Abgesagt“ → Absagegrund aus dem Katalog ist Pflicht
  const [{ data: zielStage }, { data: vorher }] = await Promise.all([
    supabase.from('pipeline_stages').select('stage_type, name').eq('id', stage_id).maybeSingle(),
    supabase.from('candidates').select('current_stage_id, abgesagt_am').eq('id', id).maybeSingle(),
  ]);
  const ziel = zielStage as { stage_type: string | null; name: string | null } | null;
  const istAbsage = istAbgesagtStage(ziel);
  const alt = vorher as { current_stage_id: string | null; abgesagt_am: string | null } | null;

  const updatePayload: Record<string, unknown> = { current_stage_id: stage_id };
  if (istAbsage) {
    const absage = absageAusBody(body);
    if ('fehler' in absage) return NextResponse.json({ error: absage.fehler }, { status: 400 });
    Object.assign(updatePayload, absageFelder({ code: absage.code, notiz: absage.notiz, userId: user.id, phaseId: alt?.current_stage_id ?? null }));
  } else if (alt?.abgesagt_am) {
    // Wieder aktiv → zählt nicht mehr als Absage
    Object.assign(updatePayload, ABSAGE_LEER);
  }

  const { data: updated, error: updateError } = await supabase
    .from('candidates')
    .update(updatePayload)
    .eq('id', id)
    .select('id');

  if (updateError) {
    return NextResponse.json({ error: 'Update fehlgeschlagen.' }, { status: 500 });
  }
  // RLS kann still filtern: 0 betroffene Zeilen = kein Zugriff auf diesen Bewerber
  if (!updated?.length) {
    return NextResponse.json({ error: 'Kein Zugriff auf diesen Bewerber.' }, { status: 403 });
  }

  // Log the stage change
  await supabase.from('candidate_stages').insert({
    candidate_id: id,
    stage_id,
    changed_by: user.id,
  });

  // Get candidate's agency_id for automation
  const { data: candidate } = await supabase
    .from('candidates')
    .select('agency_id')
    .eq('id', id)
    .single();

  let gestoppt: Awaited<ReturnType<typeof stoppeAbgesagtenBewerber>>['gestoppt'] | null = null;

  // Bewerbungen mitziehen, damit Kanban (applications.stage_id) und Bewerberakte nicht auseinanderlaufen
  if (candidate) {
    // Ältere Stufen ohne stage_type erkennt man am Namen „Eingestellt“ bzw. „Abgesagt“
    const eingestellt = istEingestelltStage(ziel);
    await supabase
      .from('applications')
      .update({
        stage_id,
        status: eingestellt ? 'hired' : istAbsage ? 'rejected' : 'open',
        updated_at: new Date().toISOString(),
      })
      .eq('candidate_id', id)
      .eq('agency_id', candidate.agency_id);
    // Einstellung: Datum merken (Basis für „Umsätze & ROI“), nur beim ersten Mal
    if (eingestellt) {
      await supabase.from('candidates').update({ eingestellt_am: new Date().toISOString() }).eq('id', id).is('eingestellt_am', null);
    }
    // Absage: Anrufversuche, KI-Agent, geplante Jobs und künftige Termine stoppen – ohne Nachricht an den Bewerber
    if (istAbsage) {
      ({ gestoppt } = await stoppeAbgesagtenBewerber(createAdminClient(), { candidateId: id, agencyId: candidate.agency_id }));
    }
  }

  if (candidate) {
    // Die Automations-Engine verschickt bei einer Absage-Phase nichts nach außen (engine.ts, executeAction)
    fireEvent('stage_changed', candidate.agency_id, { candidate_id: id, extra: { new_stage_id: stage_id } }).catch(() => {});
  }

  return NextResponse.json({ success: true, ...(gestoppt ? { gestoppt } : {}) });
}
