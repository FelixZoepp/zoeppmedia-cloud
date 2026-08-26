import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase/server';
import { startCadence, stopCadence } from '@/lib/cadence/engine';

/**
 * GET — returns cadence state for a candidate.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: candidate, error } = await supabase
    .from('candidates')
    .select('cadence_active, cadence_attempt, cadence_next_at, cadence_next_window, cadence_stopped_reason, preferred_call_window')
    .eq('id', id)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!candidate) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  return NextResponse.json(candidate);
}

/**
 * POST — manually start or stop cadence.
 * Body: { action: 'start' } or { action: 'stop', reason: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { action, reason } = body;

  if (action !== 'start' && action !== 'stop') {
    return NextResponse.json({ error: 'Invalid action. Use "start" or "stop".' }, { status: 400 });
  }

  // Get candidate to verify existence and get agency_id
  const { data: candidate } = await supabase
    .from('candidates')
    .select('agency_id')
    .eq('id', id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  if (action === 'start') {
    await startCadence(supabase, id, candidate.agency_id);
    return NextResponse.json({ ok: true, action: 'started' });
  }

  if (action === 'stop') {
    await stopCadence(supabase, id, reason || 'manual');
    return NextResponse.json({ ok: true, action: 'stopped', reason: reason || 'manual' });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

/**
 * PATCH — set preferred call window for a candidate.
 * Body: { preferred_call_window: 'morning' | 'afternoon' | 'evening' }
 *
 * Also adjusts the cadence next window if cadence is active.
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { preferred_call_window } = body;

  const validWindows = ['morning', 'afternoon', 'evening'];
  if (!validWindows.includes(preferred_call_window)) {
    return NextResponse.json(
      { error: 'Invalid window. Use "morning", "afternoon", or "evening".' },
      { status: 400 }
    );
  }

  // Update preferred window
  const updateData: Record<string, string> = {
    preferred_call_window,
  };

  // If cadence is active, also adjust the next window
  const { data: candidate } = await supabase
    .from('candidates')
    .select('cadence_active')
    .eq('id', id)
    .single();

  if (!candidate) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  if (candidate.cadence_active) {
    updateData.cadence_next_window = preferred_call_window;
  }

  const { error } = await supabase
    .from('candidates')
    .update(updateData)
    .eq('id', id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If candidate set a preferred window, stop cadence (they communicated)
  await stopCadence(supabase, id, 'preferred_window_set');

  return NextResponse.json({ ok: true, preferred_call_window });
}
