import { createServerClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';
import { logActivity } from '@/lib/activity/log';
import { fireEvent } from '@/lib/automations/fire';

const POINT_VALUES: Record<string, number> = {
  no_show: 1.0,
  late_cancel: 0.5,
};

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, name, noshow_points, blacklisted, blacklist_reason, blacklisted_at, blacklist_expires_at')
    .eq('id', id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const { data: events } = await supabase
    .from('noshow_events')
    .select('*, created_by_user:users(name)')
    .eq('candidate_id', id)
    .order('created_at', { ascending: false });

  return NextResponse.json({
    candidate: {
      id: candidate.id,
      name: candidate.name,
      noshow_points: candidate.noshow_points,
      blacklisted: candidate.blacklisted,
      blacklist_reason: candidate.blacklist_reason,
      blacklisted_at: candidate.blacklisted_at,
      blacklist_expires_at: candidate.blacklist_expires_at,
    },
    events: events || [],
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('users')
    .select('agency_id')
    .eq('id', user.id)
    .single();

  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, name, agency_id')
    .eq('id', id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const body = await request.json();
  const { event_type, appointment_type, reason, points: customPoints } = body;

  if (!event_type || !['no_show', 'late_cancel', 'point_override'].includes(event_type)) {
    return NextResponse.json({ error: 'Ungültiger event_type' }, { status: 400 });
  }

  // Determine points
  let points: number;
  if (event_type === 'point_override') {
    if (typeof customPoints !== 'number') {
      return NextResponse.json({ error: 'points ist erforderlich für point_override' }, { status: 400 });
    }
    points = customPoints;
  } else {
    points = POINT_VALUES[event_type];
  }

  // Insert noshow event
  const { error: insertError } = await supabase
    .from('noshow_events')
    .insert({
      agency_id: candidate.agency_id,
      candidate_id: id,
      event_type,
      points,
      appointment_type: appointment_type || null,
      reason: reason || null,
      created_by: user.id,
    });

  if (insertError) {
    return NextResponse.json({ error: 'Konnte Event nicht erstellen.' }, { status: 500 });
  }

  // Recalculate total points from all noshow_events
  const { data: allEvents } = await supabase
    .from('noshow_events')
    .select('points')
    .eq('candidate_id', id);

  const totalPoints = (allEvents || []).reduce(
    (sum, e) => sum + Number(e.points),
    0
  );

  // Update candidate
  const updateData: Record<string, unknown> = {
    noshow_points: totalPoints,
  };

  if (totalPoints >= 3) {
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 12);

    updateData.blacklisted = true;
    updateData.blacklisted_at = new Date().toISOString();
    updateData.blacklisted_by = user.id;
    updateData.blacklist_reason = reason || `Automatisch gesperrt: ${totalPoints} No-Show Punkte`;
    updateData.blacklist_expires_at = expiresAt.toISOString();
  } else if (totalPoints < 3) {
    // If points dropped below 3 (via override), remove blacklist
    updateData.blacklisted = false;
    updateData.blacklist_reason = null;
    updateData.blacklisted_at = null;
    updateData.blacklisted_by = null;
    updateData.blacklist_expires_at = null;
  }

  await supabase
    .from('candidates')
    .update(updateData)
    .eq('id', id);

  const actionLabel = event_type === 'no_show'
    ? 'No-Show'
    : event_type === 'late_cancel'
      ? 'Kurzfristige Absage'
      : 'Punkte-Korrektur';

  await logActivity(supabase, {
    agency_id: candidate.agency_id,
    user_id: user.id,
    candidate_id: id,
    action: `${actionLabel}: ${points > 0 ? '+' : ''}${points} Punkte (gesamt: ${totalPoints})`,
    action_type: 'other',
    metadata: { event_type, points, totalPoints, appointment_type, reason },
  });

  fireEvent('noshow_recorded', candidate.agency_id, { candidate_id: id }).catch(() => {});

  return NextResponse.json({
    noshow_points: totalPoints,
    blacklisted: totalPoints >= 3,
    event_type,
    points,
  });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: candidate } = await supabase
    .from('candidates')
    .select('id, name, agency_id, noshow_points')
    .eq('id', id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const body = await request.json();
  const { reason } = body;

  if (!reason) {
    return NextResponse.json({ error: 'Grund ist erforderlich' }, { status: 400 });
  }

  const currentPoints = Number(candidate.noshow_points) || 0;

  // Insert a point_override event to zero out
  if (currentPoints !== 0) {
    await supabase
      .from('noshow_events')
      .insert({
        agency_id: candidate.agency_id,
        candidate_id: id,
        event_type: 'point_override',
        points: -currentPoints,
        reason: `Blacklist entfernt: ${reason}`,
        created_by: user.id,
      });
  }

  // Clear blacklist fields
  await supabase
    .from('candidates')
    .update({
      blacklisted: false,
      blacklist_reason: null,
      blacklisted_at: null,
      blacklisted_by: null,
      blacklist_expires_at: null,
      noshow_points: 0,
    })
    .eq('id', id);

  await logActivity(supabase, {
    agency_id: candidate.agency_id,
    user_id: user.id,
    candidate_id: id,
    action: `Blacklist entfernt: ${reason}`,
    action_type: 'other',
    metadata: { reason, previous_points: currentPoints },
  });

  return NextResponse.json({ ok: true, blacklisted: false, noshow_points: 0 });
}
