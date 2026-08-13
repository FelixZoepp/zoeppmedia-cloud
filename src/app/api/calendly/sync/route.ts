import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  listScheduledEvents,
  getEventInvitees,
  extractPhoneFromInvitee,
  extractEventUuid,
} from '@/lib/calendly/api';

/**
 * POST /api/calendly/sync
 *
 * Manually sync upcoming events from Calendly API.
 * Internal users only.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  try {
    // Fetch upcoming events from Calendly (next 30 days)
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const events = await listScheduledEvents({
      min_start_time: now.toISOString(),
      max_start_time: thirtyDaysLater.toISOString(),
      status: 'active',
    });

    let synced = 0;
    let matched = 0;

    for (const event of events) {
      const calendlyEventId = extractEventUuid(event.uri);

      // Get invitees for this event
      let invitees;
      try {
        invitees = await getEventInvitees(event.uri);
      } catch {
        continue;
      }

      for (const invitee of invitees) {
        if (invitee.status === 'canceled') continue;

        const phone = extractPhoneFromInvitee(invitee);

        // Try to match to a candidate
        let candidateId: string | null = null;
        let agencyId: string | null = null;

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
            matched++;
          }
        }

        // Extract location
        const location = event.location?.location ||
          event.location?.join_url ||
          event.location?.type ||
          null;

        // Upsert to avoid duplicates
        const { error: upsertError } = await supabase
          .from('calendly_events')
          .upsert(
            {
              agency_id: agencyId,
              candidate_id: candidateId,
              calendly_event_id: calendlyEventId,
              event_type: event.name || null,
              event_name: event.name || null,
              start_time: event.start_time,
              end_time: event.end_time || null,
              invitee_name: invitee.name || null,
              invitee_email: invitee.email || null,
              invitee_phone: phone,
              status: 'scheduled',
              location,
            },
            { onConflict: 'calendly_event_id' }
          );

        if (!upsertError) {
          synced++;
        }
      }
    }

    return NextResponse.json({ ok: true, synced, matched, total_events: events.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
