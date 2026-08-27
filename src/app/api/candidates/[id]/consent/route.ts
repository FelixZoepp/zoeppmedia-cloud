import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { NextRequest, NextResponse } from 'next/server';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';

const VALID_CHANNELS = ['whatsapp', 'email', 'sms', 'phone_recording'] as const;
const VALID_EVENT_TYPES = ['opt_in', 'opt_out', 'recording_consent', 'recording_decline'] as const;
const VALID_SOURCES = ['funnel_form', 'whatsapp_reply', 'manual', 'bot', 'call'] as const;

type Channel = (typeof VALID_CHANNELS)[number];
type EventType = (typeof VALID_EVENT_TYPES)[number];
type Source = (typeof VALID_SOURCES)[number];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: events, error } = await supabase
    .from('consent_events')
    .select('*, created_by_user:users(name)')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: 'Consent-Events konnten nicht geladen werden.' }, { status: 500 });
  }

  return NextResponse.json(events);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { channel, event_type, source, evidence } = body as {
    channel: string;
    event_type: string;
    source: string;
    evidence?: string;
  };

  // Validate required fields
  if (!channel || !event_type || !source) {
    return NextResponse.json(
      { error: 'channel, event_type und source sind erforderlich.' },
      { status: 400 }
    );
  }

  if (!VALID_CHANNELS.includes(channel as Channel)) {
    return NextResponse.json(
      { error: `Ungültiger channel. Erlaubt: ${VALID_CHANNELS.join(', ')}` },
      { status: 400 }
    );
  }

  if (!VALID_EVENT_TYPES.includes(event_type as EventType)) {
    return NextResponse.json(
      { error: `Ungültiger event_type. Erlaubt: ${VALID_EVENT_TYPES.join(', ')}` },
      { status: 400 }
    );
  }

  if (!VALID_SOURCES.includes(source as Source)) {
    return NextResponse.json(
      { error: `Ungültige source. Erlaubt: ${VALID_SOURCES.join(', ')}` },
      { status: 400 }
    );
  }

  // Verify candidate exists and belongs to the user's agency (RLS handles scoping)
  const { data: candidate, error: candidateError } = await supabase
    .from('candidates')
    .select('id, agency_id')
    .eq('id', id)
    .single();

  if (candidateError || !candidate) {
    return NextResponse.json({ error: 'Bewerber nicht gefunden.' }, { status: 404 });
  }

  // Insert consent event
  const { data: event, error: insertError } = await supabase
    .from('consent_events')
    .insert({
      agency_id: candidate.agency_id,
      candidate_id: id,
      channel,
      event_type,
      source,
      evidence: evidence || null,
      created_by: currentUser.id,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: 'Consent-Event konnte nicht gespeichert werden.' },
      { status: 500 }
    );
  }

  // Update candidate summary fields based on event
  const candidateUpdate = buildCandidateUpdate(channel as Channel, event_type as EventType);

  if (Object.keys(candidateUpdate).length > 0) {
    await supabase
      .from('candidates')
      .update(candidateUpdate)
      .eq('id', id);
  }

  // If opt_out, check if ALL channels are now opted out → set do_not_contact
  if (event_type === 'opt_out') {
    const { data: updatedCandidate } = await supabase
      .from('candidates')
      .select('whatsapp_opt_in, email_opt_in, sms_opt_in')
      .eq('id', id)
      .single();

    if (
      updatedCandidate &&
      !updatedCandidate.whatsapp_opt_in &&
      !updatedCandidate.email_opt_in &&
      !updatedCandidate.sms_opt_in
    ) {
      await supabase
        .from('candidates')
        .update({ do_not_contact: true })
        .eq('id', id);
    }
  }

  // Log activity
  await logActivity(supabase, {
    agency_id: candidate.agency_id,
    user_id: currentUser.id,
    candidate_id: id,
    action: `DSGVO Consent: ${event_type} für ${channel}`,
    action_type: 'consent_event',
    metadata: { channel, event_type, source, evidence: evidence || null },
  });

  if (event_type === 'opt_out') {
    fireEvent('opt_out', candidate.agency_id, { candidate_id: id, extra: { channel } }).catch(() => {});
  }

  return NextResponse.json(event, { status: 201 });
}

function buildCandidateUpdate(
  channel: Channel,
  eventType: EventType
): Record<string, boolean> {
  const update: Record<string, boolean> = {};

  switch (eventType) {
    case 'opt_in':
      if (channel === 'whatsapp') update.whatsapp_opt_in = true;
      if (channel === 'email') update.email_opt_in = true;
      if (channel === 'sms') update.sms_opt_in = true;
      break;
    case 'opt_out':
      if (channel === 'whatsapp') update.whatsapp_opt_in = false;
      if (channel === 'email') update.email_opt_in = false;
      if (channel === 'sms') update.sms_opt_in = false;
      break;
    case 'recording_consent':
      update.recording_consent = true;
      break;
    case 'recording_decline':
      update.recording_consent = false;
      break;
  }

  return update;
}
