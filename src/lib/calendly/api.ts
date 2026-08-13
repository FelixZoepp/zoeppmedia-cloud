/**
 * Calendly API helper
 *
 * Uses CALENDLY_API_KEY from env for authentication.
 * Docs: https://developer.calendly.com/api-docs/
 */

const CALENDLY_BASE = 'https://api.calendly.com';

function getHeaders(): HeadersInit {
  const token = process.env.CALENDLY_API_KEY;
  if (!token) {
    throw new Error('CALENDLY_API_KEY is not set');
  }
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
}

export interface CalendlyScheduledEvent {
  uri: string;
  name: string;
  status: 'active' | 'canceled';
  start_time: string;
  end_time: string;
  event_type: string;
  location?: {
    type: string;
    location?: string;
    join_url?: string;
  };
  invitees_counter: {
    total: number;
    active: number;
    limit: number;
  };
  created_at: string;
  updated_at: string;
}

export interface CalendlyInvitee {
  uri: string;
  name: string;
  email: string;
  status: 'active' | 'canceled';
  questions_and_answers: { question: string; answer: string }[];
  timezone: string;
  created_at: string;
  updated_at: string;
}

interface CalendlyPaginatedResponse<T> {
  collection: T[];
  pagination: {
    count: number;
    next_page: string | null;
    previous_page: string | null;
    next_page_token: string | null;
  };
}

/**
 * Get the current user's URI (needed for most API calls)
 */
export async function getCurrentUserUri(): Promise<string> {
  const res = await fetch(`${CALENDLY_BASE}/users/me`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Calendly API error: ${res.status}`);
  }

  const data = await res.json();
  return data.resource.uri;
}

/**
 * List scheduled events for the organization
 */
export async function listScheduledEvents(opts?: {
  min_start_time?: string;
  max_start_time?: string;
  status?: 'active' | 'canceled';
  count?: number;
}): Promise<CalendlyScheduledEvent[]> {
  const userUri = await getCurrentUserUri();

  const params = new URLSearchParams({
    user: userUri,
    count: String(opts?.count || 50),
    sort: 'start_time:asc',
  });

  if (opts?.min_start_time) params.set('min_start_time', opts.min_start_time);
  if (opts?.max_start_time) params.set('max_start_time', opts.max_start_time);
  if (opts?.status) params.set('status', opts.status);

  const res = await fetch(
    `${CALENDLY_BASE}/scheduled_events?${params.toString()}`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    throw new Error(`Calendly API error: ${res.status}`);
  }

  const data: CalendlyPaginatedResponse<CalendlyScheduledEvent> = await res.json();
  return data.collection;
}

/**
 * Get invitees for a specific event
 */
export async function getEventInvitees(eventUri: string): Promise<CalendlyInvitee[]> {
  const eventUuid = eventUri.split('/').pop();
  const res = await fetch(
    `${CALENDLY_BASE}/scheduled_events/${eventUuid}/invitees`,
    { headers: getHeaders() }
  );

  if (!res.ok) {
    throw new Error(`Calendly API error: ${res.status}`);
  }

  const data: CalendlyPaginatedResponse<CalendlyInvitee> = await res.json();
  return data.collection;
}

/**
 * Extract phone number from Calendly invitee questions
 */
export function extractPhoneFromInvitee(invitee: CalendlyInvitee): string | null {
  const phoneQuestion = invitee.questions_and_answers.find(
    (qa) =>
      qa.question.toLowerCase().includes('telefon') ||
      qa.question.toLowerCase().includes('phone') ||
      qa.question.toLowerCase().includes('handy') ||
      qa.question.toLowerCase().includes('mobil')
  );
  return phoneQuestion?.answer || null;
}

/**
 * Extract the event UUID from a Calendly event URI
 */
export function extractEventUuid(uri: string): string {
  return uri.split('/').pop() || uri;
}
