import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

/**
 * Complete the transcript review:
 * 1. Verify all pflicht answers are confirmed/korrigiert
 * 2. Write answers to client_profiles using ziel_feld mapping
 * 3. Set transcript status to 'geprueft'
 * 4. Unblock dependent project_tasks
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: transcriptId } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Load transcript
  const { data: transcript, error: tError } = await supabase
    .from('transcripts')
    .select('*')
    .eq('id', transcriptId)
    .single();

  if (tError || !transcript) {
    return NextResponse.json({ error: 'Transkript nicht gefunden' }, { status: 404 });
  }

  // Load all answers
  const { data: answers, error: aError } = await supabase
    .from('transcript_answers')
    .select('*')
    .eq('transcript_id', transcriptId);

  if (aError) {
    return NextResponse.json({ error: aError.message }, { status: 500 });
  }

  // Load questions to check pflicht status
  const { data: questions } = await supabase
    .from('transcript_questions')
    .select('key, pflicht')
    .eq('aktiv', true);

  const pflichtKeys = new Set(
    (questions ?? []).filter((q: { key: string; pflicht: boolean }) => q.pflicht).map((q: { key: string }) => q.key)
  );

  // Check all pflicht answers are confirmed or korrigiert
  const pflichtAnswers = (answers ?? []).filter(
    (a: { frage_key: string }) => pflichtKeys.has(a.frage_key)
  );

  const unresolved = pflichtAnswers.filter(
    (a: { status: string }) => a.status === 'offen' || a.status === 'nachfragen'
  );

  if (unresolved.length > 0) {
    const unresolvedKeys = unresolved.map((a: { frage_key: string }) => a.frage_key).join(', ');
    return NextResponse.json(
      { error: `Pflicht-Fragen noch offen: ${unresolvedKeys}` },
      { status: 400 }
    );
  }

  // Write confirmed answers to client_profiles using ziel_feld mapping
  const agencyId = transcript.agency_id;
  const profileUpdates: Record<string, unknown> = {};

  for (const answer of (answers ?? [])) {
    if (!answer.ziel_feld) continue;
    if (answer.status !== 'bestaetigt' && answer.status !== 'korrigiert') continue;

    const value = answer.korrigierter_wert || answer.antwort;
    if (!value) continue;

    // ziel_feld format: "client_profiles.feldname" or "agencies.feldname"
    const [table, field] = answer.ziel_feld.split('.');
    if (!table || !field) continue;

    if (table === 'client_profiles') {
      profileUpdates[field] = value;
    } else if (table === 'agencies') {
      // Update agency record directly
      await supabase
        .from('agencies')
        .update({ [field]: value })
        .eq('id', agencyId);
    }
  }

  // Upsert client_profiles
  if (Object.keys(profileUpdates).length > 0) {
    const { error: profileError } = await supabase
      .from('client_profiles')
      .upsert(
        { agency_id: agencyId, ...profileUpdates },
        { onConflict: 'agency_id' }
      );

    if (profileError) {
      console.error('[complete] client_profiles update fehlgeschlagen:', profileError.message);
    }
  }

  // Set transcript to 'geprueft'
  await supabase
    .from('transcripts')
    .update({
      status: 'geprueft',
      geprueft_von: user.id,
      geprueft_am: new Date().toISOString(),
    })
    .eq('id', transcriptId);

  // Unblock dependent project_tasks
  const { data: blockedTasks } = await supabase
    .from('project_tasks')
    .select('id, blockiert_durch')
    .eq('agency_id', agencyId)
    .eq('status', 'blockiert');

  if (blockedTasks) {
    for (const task of blockedTasks) {
      // Check if this task was blocked by transkript_geprueft trigger
      // Remove the block and set to offen if no other blockers remain
      const taskTemplate = await supabase
        .from('task_templates')
        .select('ausloeser')
        .eq('id', task.blockiert_durch?.[0] ?? '')
        .single();

      if (taskTemplate?.data?.ausloeser === 'transkript_geprueft') {
        await supabase
          .from('project_tasks')
          .update({ status: 'offen', blockiert_durch: null })
          .eq('id', task.id);
      }
    }
  }

  return NextResponse.json({ success: true });
}
