import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { secretFehlt } from '@/lib/security/webhook-secret';
import { fireEvent } from '@/lib/automations/fire';
import { signalSafe } from '@/lib/fulfillment/engine';
import {
  SALES_EVENT_TYPES,
  handleSalesBooking,
  handleSalesCancellation,
  extractInviteePhone,
  extractCompany,
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
  /** true, wenn die Absage Teil einer Verschiebung ist */
  rescheduled?: boolean;
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
  const isTestimonial = name.includes('testimonial');
  if (name.includes('onboarding')) marker = 'termin:onboarding_call';
  else if (name.includes('kickoff') || name.includes('kick-off') || name.includes('kick off')) marker = 'termin:kickoff_call';
  if (!marker && !isTestimonial) return;

  const { data: clientUser } = await supabase
    .from('users')
    .select('agency_id')
    .ilike('email', inviteeEmail)
    .in('role', ['agency_owner', 'agency_member'])
    .limit(1)
    .maybeSingle();

  let agencyId = clientUser?.agency_id ?? null;
  if (!agencyId) {
    // Kunden haben oft (noch) keinen Login → über die E-Mail aus dem After-Close zuordnen
    const { data: agency } = await supabase.from('agencies').select('id').ilike('email', inviteeEmail).limit(1).maybeSingle();
    agencyId = (agency as { id: string } | null)?.id ?? null;
  }
  if (!agencyId) return;

  // Fulfillment v2: Testimonial-Termin bzw. Kick-off/Onboarding-Termin gebucht
  if (isTestimonial) {
    await signalSafe(supabase, agencyId, 'testimonial_gebucht');
    return;
  }
  await signalSafe(supabase, agencyId, 'kickoff_gebucht');

  await supabase
    .from('project_tasks')
    .update({ status: 'erledigt', erledigt_am: new Date().toISOString() })
    .eq('agency_id', agencyId)
    .eq('notiz', marker)
    .neq('status', 'erledigt');
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();

  const signingKey = process.env.CALENDLY_WEBHOOK_SIGNING_KEY;
  if (!signingKey) return secretFehlt('CALENDLY_WEBHOOK_SIGNING_KEY');
  const sigHeader = request.headers.get('calendly-webhook-signature');
  if (!verifyCalendlySignature(rawBody, sigHeader, signingKey)) {
    return NextResponse.json({ error: 'Ungültige Signatur' }, { status: 401 });
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

  // Telefonnummer: SMS-Reminder-Feld, dann "Ich rufe an"-Ort, dann Fragen
  const phone = extractInviteePhone(invitee, scheduledEvent.location);

  // Extract Calendly event UUID for deduplication
  const calendlyEventId = scheduledEvent.uuid || scheduledEvent.uri?.split('/').pop() || null;

  // Location
  const location = scheduledEvent.location?.location ||
    scheduledEvent.location?.join_url ||
    scheduledEvent.location?.type ||
    null;

  // Sales-Bot: Buchungen auf den Sales-Event-Types laufen komplett getrennt vom Recruiting
  // (kein Kandidaten-Matching, keine Recruiting-Automationen).
  const salesChain = eventTypeUuid ? SALES_EVENT_TYPES[eventTypeUuid] : undefined;
  if (salesChain && calendlyEventId) {
    try {
      if (event === 'invitee.canceled') {
        await handleSalesCancellation(supabase, calendlyEventId, {
          inviteeName: invitee.name || 'Unbekannt',
          startTime: scheduledEvent.start_time ?? null,
          rescheduled: invitee.rescheduled === true,
        });
        return NextResponse.json({ ok: true, action: 'cancelled', sales: true });
      }
      if (event === 'invitee.created' && scheduledEvent.start_time) {
        const result = await handleSalesBooking(supabase, {
          chain: salesChain,
          calendlyEventId,
          eventTypeName,
          eventName: scheduledEvent.name || null,
          startTime: scheduledEvent.start_time,
          endTime: scheduledEvent.end_time || null,
          location,
          inviteeName: invitee.name || 'Unbekannt',
          inviteeEmail: invitee.email || null,
          phone,
          company: extractCompany(invitee),
        });
        return NextResponse.json({ ok: true, action: 'created', sales: true, ...result });
      }
    } catch (err) {
      console.error('[calendly] Sales-Bot fehlgeschlagen:', err);
      return NextResponse.json({ error: 'Sales-Verarbeitung fehlgeschlagen' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, action: 'ignored', sales: true, event });
  }

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
        // await: nach der Antwort friert Vercel die Funktion ein — Automationen liefen sonst nicht (vollständig)
        try {
          await fireEvent('appointment_cancelled', existingEvent.agency_id, { candidate_id: existingEvent.candidate_id });
        } catch (err) {
          console.error('[calendly] appointment_cancelled-Automationen fehlgeschlagen:', err);
        }
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

    // Bestehende Buchung (Webhook-Retry, verspätetes invitee.created): nur Zeit-/Ortsfelder
    // aktualisieren. agency_id/candidate_id/status bleiben — ein abgesagter Termin wird
    // nicht wieder aktiv, eine Sales-Zuordnung geht nicht verloren.
    const { data: existing } = calendlyEventId
      ? await supabase
          .from('calendly_events')
          .select('id, agency_id, candidate_id')
          .eq('calendly_event_id', calendlyEventId)
          .maybeSingle()
      : { data: null };

    const timeFields = {
      event_type: eventTypeName,
      event_name: scheduledEvent.name || null,
      start_time: scheduledEvent.start_time,
      end_time: scheduledEvent.end_time || null,
      invitee_name: invitee.name || null,
      invitee_email: invitee.email || null,
      invitee_phone: phone,
      location,
    };

    const { error: insertError } = existing
      ? await supabase
          .from('calendly_events')
          .update({
            ...timeFields,
            // Nur leere Zuordnungen nachtragen, vorhandene nie überschreiben
            ...(!existing.agency_id && agencyId ? { agency_id: agencyId, candidate_id: candidateId } : {}),
          })
          .eq('id', existing.id)
      : await supabase.from('calendly_events').insert({
          ...timeFields,
          agency_id: agencyId,
          candidate_id: candidateId,
          calendly_event_id: calendlyEventId,
          status: 'scheduled',
        });

    if (insertError) {
      console.error('Calendly webhook insert error:', insertError);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Automationen nur bei neuer Buchung — Retries lösen sie nicht erneut aus
    if (!existing && agencyId && candidateId) {
      try {
        await fireEvent('appointment_created', agencyId, { candidate_id: candidateId, extra: { event_type: eventTypeName } });
      } catch (err) {
        console.error('[calendly] appointment_created-Automationen fehlgeschlagen:', err);
      }
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
