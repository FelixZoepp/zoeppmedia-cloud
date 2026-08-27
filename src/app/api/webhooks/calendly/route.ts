import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { fireEvent } from '@/lib/automations/fire';

/**
 * Calendly Webhook Handler
 *
 * Receives webhook payloads from Calendly for:
 * - invitee.created: New booking
 * - invitee.canceled: Cancellation
 *
 * No auth required — this is called by Calendly's system.
 */

interface CalendlyWebhookPayload {
  event: string;
  payload: {
    event: string; // event URI
    event_type: {
      uuid: string;
      name: string;
    };
    invitee: {
      uri: string;
      uuid: string;
      name: string;
      email: string;
      timezone: string;
      created_at: string;
      canceled: boolean;
      questions_and_answers: { question: string; answer: string; position: number }[];
    };
    scheduled_event: {
      uri: string;
      uuid: string;
      name: string;
      status: string;
      start_time: string;
      end_time: string;
      event_type: string;
      location?: {
        type: string;
        location?: string;
        join_url?: string;
      };
    };
  };
}

function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-\(\)]/g, '');
}

export async function POST(request: NextRequest) {
  let body: CalendlyWebhookPayload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { event, payload } = body;

  if (!event || !payload) {
    return NextResponse.json({ error: 'Missing event or payload' }, { status: 400 });
  }

  const supabase = createAdminClient();

  const scheduledEvent = payload.scheduled_event;
  const invitee = payload.invitee;
  const eventType = payload.event_type;

  if (!scheduledEvent || !invitee) {
    return NextResponse.json({ error: 'Missing scheduled_event or invitee' }, { status: 400 });
  }

  // Extract phone number from questions
  const phoneAnswer = invitee.questions_and_answers?.find(
    (qa) =>
      qa.question.toLowerCase().includes('telefon') ||
      qa.question.toLowerCase().includes('phone') ||
      qa.question.toLowerCase().includes('handy') ||
      qa.question.toLowerCase().includes('mobil')
  );
  const phone = phoneAnswer?.answer || null;

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
    }
    return NextResponse.json({ ok: true, action: 'cancelled' });
  }

  // Handle new booking (invitee.created)
  if (event === 'invitee.created') {
    // Try to match invitee to a candidate by email or phone
    let candidateId: string | null = null;
    let agencyId: string | null = null;

    // Match by email first
    if (invitee.email) {
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
          event_type: eventType?.name || null,
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
      fireEvent('appointment_created', agencyId, { candidate_id: candidateId, extra: { event_type: eventType?.name || null } }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      action: 'created',
      matched_candidate: candidateId !== null,
    });
  }

  // Unknown event type — accept gracefully
  return NextResponse.json({ ok: true, action: 'ignored', event });
}
