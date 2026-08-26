import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/activity/log';

const CONTACT_RESULTS = ['termin_vereinbart', 'kein_interesse', 'rueckruf', 'sonstiges'];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabase
    .from('call_logs')
    .select('*')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  // Get candidate to verify it exists and retrieve agency_id + TTFC fields
  const { data: candidate } = await supabase
    .from('candidates')
    .select('agency_id, first_dial_at, first_contact_at, created_at')
    .eq('id', id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Bewerber nicht gefunden.' }, { status: 404 });

  const { data, error } = await supabase
    .from('call_logs')
    .insert({
      candidate_id: id,
      agency_id: candidate.agency_id,
      user_id: user.id,
      result: body.result,
      notes: body.notes || null,
      next_step: body.next_step || null,
      next_contact_date: body.next_contact_date || null,
      duration_seconds: body.duration_seconds || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Update TTFC tracking fields
  const now = new Date().toISOString();
  const ttfcUpdate: Record<string, string | number> = {};

  if (!candidate.first_dial_at) {
    ttfcUpdate.first_dial_at = now;
  }

  if (!candidate.first_contact_at && CONTACT_RESULTS.includes(body.result)) {
    ttfcUpdate.first_contact_at = now;
    const createdAt = new Date(candidate.created_at).getTime();
    const nowMs = new Date(now).getTime();
    ttfcUpdate.ttfc_seconds = Math.round((nowMs - createdAt) / 1000);
  }

  if (Object.keys(ttfcUpdate).length > 0) {
    await supabase
      .from('candidates')
      .update(ttfcUpdate)
      .eq('id', id);
  }

  await logActivity(supabase, {
    agency_id: candidate.agency_id,
    user_id: user.id,
    candidate_id: id,
    action: `Anruf erfasst: ${body.result}`,
    action_type: 'call',
    metadata: { result: body.result, next_step: body.next_step ?? null },
  });

  return NextResponse.json(data, { status: 201 });
}
