import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { fireEvent } from '@/lib/automations/fire';
import {
  SALES_EVENT_TYPES,
  salesRemindersEnabled,
  handleSalesBooking,
  cancelSalesJobs,
} from '@/lib/sales/calendly-chain';

/**
 * Calendly Webhook Handler
 *
 * Receives webhook payloads from Calendly for:
 * - invitee.created: New booking
 * - invitee.canceled: Cancellation
 *
 * Signaturprüfung via CALENDLY_WEBHOOK_SIGNING_KEY (Header: Calendly-Webhook-Signature,
 * Format: t=timestamp,v1=hmac, signiert wird `${t}.${rawBody}`). Wird nur geprüft,
 * wenn der Key gesetzt ist — sonst läuft der Webhook wie bisher weiter.
 */

function verifyCalendlySignature(rawBody: string, sigHeader: string | null, signingKey: string): boolean {
  if (!sigHeader) return false;
  const parts: Record<string, string> = {};
  for (const part of sigHeader.split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    parts[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
  }
  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false;
  const expected = createHmac('sha256', signingKey).update(`${timestamp}.${rawBody}`).digest('hex');
  const sigBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  return sigBuf.length === expectedBuf.length && timingSafeEqual(sigBuf, expectedBuf);
}

interface CalendlyScheduledEvent {
  uri?: string;
  uuid?: string;
  name?: string;
  status?: string;
  start_time?: string;
  end_time?: string;
  event_type?: string; // event type URI
  location?: {
    type: string;
    location?: string;
    join_url?: string;
  };
}

interface CalendlyInvitee {
  uri?: string;
  uuid?: string;
  name?: string;
  email?: string;
  timezone?: string;
  created_at?: string;
  canceled?: boolean;
  text_reminder_number?: string | null;
  questions_and_answers?: { question: string; answer: string; position: number }[];
}

/**
 * Echte Calendly-v2-Webhooks liefern die Invitee-Felder direkt auf payload-Top-Level
 * (payload.name, payload.email, payload.scheduled_event, …). Ältere/interne Aufrufer
 * nutzten payload.invitee / payload.event_type als Objekte. Beide Formen normalisieren.
 */
interface CalendlyWebhookPayload {
  event: string;
  payload: CalendlyInvitee & {
    scheduled_event?: CalendlyScheduledEvent;
    invitee?: CalendlyInvitee;
    event_type?: { uuid?: string; name?: string };
  };
}

function normalizeWebhook(body: CalendlyWebhookPayload): {
  invitee: CalendlyInvitee;
  scheduledEvent: CalendlyScheduledEvent | null;
  eventTypeUuid: string | null;
  eventTypeName: string | null;
} {
  const p = body.payload;
  const invitee: CalendlyInvitee = p.invitee ?? p;
  const scheduledEvent = p.scheduled_event ?? null;

  // Event-Type-UUID: aus Legacy-Objekt oder aus der event_type-URI des scheduled_event
  let eventTypeUuid: string | null = p.event_type?.uuid ?? null;
  if (!eventTypeUuid && typeof scheduledEvent?.event_type === 'string') {
    eventTypeUuid = scheduledEvent.event_type.split('/').pop() || null;
  }
  const eventTypeName = p.event_type?.name ?? scheduledEvent?.name ?? null;

  return { invitee, scheduledEvent, eventTypeUuid, eventTypeName };
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '');
}

/**
 * Bucht ein Kunde (Client-User) einen Onboarding- oder Kickoff-Termin,
 * wird die zugehörige Projekt-Aufgabe automatisch erledigt.
 * Matching: Invitee-E-Mail → users.agency_id, Event-Name → notiz-Marker.
 */
async function completeAppointmentTask(
  supabase: ReturnType<typeof createAdminClient>,
  inviteeEmail: string | null,
  eventName: string
): Promise<void> {
  if (!inviteeEmail || !eventName) return;

  const name = eventName.toLowerCase();
  let marker: string | null = null;
  if (name.includes('onboarding')) marker = 'termin:onboarding_call';
  else if (name.includes('kickoff') || name.includes('kick-off') || name.includes('kick off')) marker = 'termin:kickoff_call';
  if (!marker) return;

  const { data: clientUser } = await supabase
    .from('users')
    .select('agency_id')
    .ilike('email', inviteeEmail)
    .in('role', ['agency_owner', 'agency_member'])
    .limit(1)
    .maybeSingle();

  if (!clientUser?.agency_id) return;

  await supabase
    .from('project_tasks')
    .update({ status: 'erledigt', erledigt_am: new Date().toISOString() })
    .eq('agency_id', clientUser.agency_id)
    .eq('notiz', marker)
    .neq('status', 'erledigt');
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (signingKey) {
    const sigHeader = request.headers.get('calendly-webhook-signature');
    if (!verifyCalendlySignature(rawBody, sigHeader, signingKey)) {
      return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 });
    }
  }

  let body: CalendlyWebhookPayload;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, payload } = body;

  if (!event || !payload) {
    return NextResponse.json({ error: 'Missing event or payload' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { invitee, scheduledEvent, eventTypeUuid, eventTypeName } = normalizeWebhook(body);

  if (!scheduledEvent || !invitee.name) {
    return NextResponse.json({ error: 'Missing scheduled_event or invitee' }, { status: 400 });
  }

  // Extract phone number: SMS-Reminder-Feld hat Vorrang, dann Fragen
  const phoneAnswer = invitee.questions_and_answers?.find(
    (qa) =>
      qa.question.toLowerCase().includes('telefon') ||
      qa.question.toLowerCase().includes('phone') ||
      qa.question.toLowerCase().includes('handy') ||
      qa.question.toLowerCase().includes('mobil')
  );
  const phone = invitee.text_reminder_number || phoneAnswer?.answer || null;

  // Extract Calendly event UUID for deduplication
  const calendlyEventId = scheduledEvent.uuid || scheduledEvent.uri?.split('/').pop() || null;

  // Location
  const location = scheduledEvent.location?.location ||
    scheduledEvent.location?.join_url ||
    scheduledEvent.location?.type ||
    null;

  // Handle cancellation
  if (event === 'invitee.canceled') {
    if (calendlyEventId) {
      // Try to find the candidate linked to this event for the automation
      const { data: existingEvent } = await supabase
        .from('calendly_events')
        .select('candidate_id, agency_id')
        .eq('calendly_event_id', calendlyEventId)
        .maybeSingle();

      await supabase
        .from('calendly_events')
        .update({ status: 'cancelled' })
        .eq('calendly_event_id', calendlyEventId);

      if (existingEvent?.agency_id && existingEvent?.candidate_id) {
        fireEvent('appointment_cancelled', existingEvent.agency_id, { candidate_id: existingEvent.candidate_id }).catch(() => {});
      }

      // Sales-Kette: offene Reminder-Jobs dieser Buchung canceln
      if (salesRemindersEnabled()) {
        await cancelSalesJobs(supabase, calendlyEventId).catch((err) => {
          console.error('[calendly] Sales-Jobs canceln fehlgeschlagen:', err);
        });
      }
    }
    return NextResponse.json({ ok: true, action: 'cancelled' });
  }

  // Handle new booking (invitee.created)
  if (event === 'invitee.created') {
    // Try to match invitee to a candidate by email or phone
    let candidateId: string | null = null;
    let agencyId: string | null = null;

    // Sales-Kette: Buchung auf einem Sales-Event-Type → Prospect anlegen + Jobs planen
    const salesChain = eventTypeUuid ? SALES_EVENT_TYPES[eventTypeUuid] : undefined;
    if (salesChain && salesRemindersEnabled() && calendlyEventId && scheduledEvent.start_time) {
      try {
        const result = await handleSalesBooking(supabase, {
          chain: salesChain,
          calendlyEventId,
          startTime: scheduledEvent.start_time,
          endTime: scheduledEvent.end_time || null,
          inviteeName: invitee.name || 'Unbekannt',
          inviteeEmail: invitee.email || null,
          phone,
        });
        if (result) {
          candidateId = result.candidateId;
          agencyId = result.agencyId;
        }
      } catch (err) {
        console.error('[calendly] Sales-Kette fehlgeschlagen:', err);
      }
    }

    // Match by email first
    if (!candidateId && invitee.email) {
      const { data: candidateByEmail } = await supabase
        .from('candidates')
        .select('id, agency_id')
        .ilike('email', invitee.email)
        .limit(1)
        .maybeSingle();

      if (candidateByEmail) {
        candidateId = candidateByEmail.id;
        agencyId = candidateByEmail.agency_id;
      }
    }

    // If no email match, try phone
    if (!candidateId && phone) {
      const normalized = normalizePhone(phone);
      const { data: candidates } = await supabase
        .from('candidates')
        .select('id, agency_id, phone')
        .not('phone', 'is', null);

      if (candidates) {
        const match = candidates.find(
          (c) => c.phone && normalizePhone(c.phone) === normalized
        );
        if (match) {
          candidateId = match.id;
          agencyId = match.agency_id;
        }
      }
    }

    // Insert the calendly event
    const { error: insertError } = await supabase
      .from('calendly_events')
      .upsert(
        {
          agency_id: agencyId,
          candidate_id: candidateId,
          calendly_event_id: calendlyEventId,
          event_type: eventTypeName,
          event_name: scheduledEvent.name || null,
          start_time: scheduledEvent.start_time,
          end_time: scheduledEvent.end_time || null,
          invitee_name: invitee.name || null,
          invitee_email: invitee.email || null,
          invitee_phone: phone,
          status: 'scheduled',
          location,
        },
        { onConflict: 'calendly_event_id' }
      );

    if (insertError) {
      console.error('Calendly webhook insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (agencyId && candidateId) {
      fireEvent('appointment_created', agencyId, { candidate_id: candidateId, extra: { event_type: eventTypeName } }).catch(() => {});
    }

    // Fulfillment: Onboarding-/Kickoff-Termin des Kunden hakt die passende
    // Projekt-Aufgabe automatisch ab (Marker termin:onboarding_call / termin:kickoff_call).
    await completeAppointmentTask(supabase, invitee.email || null, eventTypeName || scheduledEvent.name || '');

    return NextResponse.json({
      ok: true,
      action: 'created',
      matched_candidate: candidateId !== null,
    });
  }

  // Unknown event type — accept gracefully
  return NextResponse.json({ ok: true, action: 'ignored', event });
}
