import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { cancelBotTimers } from '@/lib/bot/timers';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  // Body parsen
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const body = rawBody as Record<string, unknown>;

  // Mindestens eines der Felder muss vorhanden sein
  const hasAssignedTo = 'assigned_to' in body;
  const hasState = 'state' in body;
  if (!hasAssignedTo && !hasState) {
    return NextResponse.json({ error: 'Nichts zu ändern' }, { status: 400 });
  }

  // State-Validierung: nur bot_active und human_active erlaubt
  if (hasState) {
    const stateValue = body.state;
    if (stateValue !== 'bot_active' && stateValue !== 'human_active') {
      return NextResponse.json({ error: 'Ungültiger Status' }, { status: 400 });
    }
  }

  const svc = createAdminClient();

  // Conversation laden (mit Tenant-Prüfung)
  const { data: conv } = await svc
    .from('conversations')
    .select('id, state, agency_id')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single();

  if (!conv) return NextResponse.json({ error: 'Konversation nicht gefunden' }, { status: 404 });

  // assigned_to validieren (wenn kein null)
  if (hasAssignedTo && body.assigned_to !== null) {
    const { data: targetUser } = await svc
      .from('users')
      .select('id')
      .eq('id', body.assigned_to as string)
      .eq('agency_id', agencyId)
      .single();

    if (!targetUser) {
      return NextResponse.json({ error: 'Nutzer nicht gefunden' }, { status: 400 });
    }
  }

  // Update-Objekt aufbauen
  const updateFields: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (hasState) {
    updateFields.state = body.state;
  }
  if (hasAssignedTo) {
    updateFields.assigned_to = body.assigned_to ?? null;
  }

  // Conversation updaten (agency-scoped)
  await svc
    .from('conversations')
    .update(updateFields)
    .eq('id', id)
    .eq('agency_id', agencyId);

  // Bot-Timer stornieren wenn auf human_active gewechselt (Bot pausieren)
  if (hasState && body.state === 'human_active') {
    await cancelBotTimers(svc, { agencyId, conversationId: id });
  }

  return NextResponse.json({ ok: true });
}
