import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// No auth required — this is called by Perspective's system.
// Use admin client to bypass RLS for webhook writes.

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger JSON-Body' }, { status: 400 });
  }

  const { name, email, phone, funnel_id } = body as {
    name?: string;
    email?: string;
    phone?: string;
    funnel_id?: string;
  };

  // funnel_id is required to associate the lead with the right agency
  if (!funnel_id) {
    return NextResponse.json({ error: 'funnel_id ist erforderlich' }, { status: 400 });
  }

  // At least one contact field must be present
  if (!name && !email && !phone) {
    return NextResponse.json(
      { error: 'Mindestens eines der Felder name, email oder phone ist erforderlich' },
      { status: 400 }
    );
  }

  const supabase = createAdminClient();

  // Resolve agency via the stored perspective_funnel_id
  const { data: funnel } = await supabase
    .from('perspective_funnels')
    .select('agency_id')
    .eq('perspective_funnel_id', funnel_id)
    .maybeSingle();

  if (!funnel) {
    return NextResponse.json(
      { error: `Kein Funnel für perspective_funnel_id "${funnel_id}" gefunden` },
      { status: 404 }
    );
  }

  // Fetch the first pipeline stage (sort_order = 1 = "Eingang")
  const { data: firstStage } = await supabase
    .from('pipeline_stages')
    .select('id')
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!firstStage) {
    return NextResponse.json(
      { error: 'Keine Pipeline-Stufen konfiguriert' },
      { status: 500 }
    );
  }

  // Create the candidate record
  const { data: candidate, error: insertError } = await supabase
    .from('candidates')
    .insert({
      agency_id: funnel.agency_id,
      name: name || 'Unbekannt',
      email: email || null,
      phone: phone || null,
      source: 'meta', // Perspective leads arrive via Meta ad funnels
      current_stage_id: firstStage.id,
    })
    .select()
    .single();

  if (insertError || !candidate) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Bewerber konnte nicht erstellt werden' },
      { status: 500 }
    );
  }

  // Log initial stage transition
  await supabase.from('candidate_stages').insert({
    candidate_id: candidate.id,
    stage_id: firstStage.id,
    changed_by: null,
  });

  return NextResponse.json({ ok: true, candidate_id: candidate.id });
}
