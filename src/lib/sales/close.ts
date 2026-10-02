/**
 * Close-Anbindung für die Sales-Kette (best effort).
 * Sucht den Lead über die E-Mail des Prospects und hängt eine Notiz an.
 * Kein Lead gefunden oder kein API-Key → still überspringen.
 */

import { createHmac } from 'crypto';

const CLOSE_BASE = 'https://api.close.com/api/v1';

function closeHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Basic ${Buffer.from(apiKey + ':').toString('base64')}`,
    'Content-Type': 'application/json',
  };
}

interface CloseLead {
  id: string;
  contacts?: Array<{ emails?: Array<{ email: string }> }>;
}

/** Lead-ID zur E-Mail finden (Volltextsuche, danach exakter Abgleich der Kontakt-E-Mails). */
export async function findCloseLeadIdByEmail(email: string): Promise<string | null> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey || !email) return null;

  const params = new URLSearchParams({ query: `"${email}"`, _fields: 'id,contacts', _limit: '5' });
  const res = await fetch(`${CLOSE_BASE}/lead/?${params}`, { headers: closeHeaders(apiKey) });
  if (!res.ok) throw new Error(`Close-Suche fehlgeschlagen (${res.status})`);

  const { data } = (await res.json()) as { data: CloseLead[] };
  const needle = email.toLowerCase();
  const match = data.find((lead) =>
    lead.contacts?.some((c) => c.emails?.some((e) => e.email.toLowerCase() === needle)),
  );
  return match?.id ?? null;
}

/** Notiz am Close-Lead des Prospects anlegen. Gibt true zurück, wenn eine Notiz geschrieben wurde. */
export async function addCloseNoteByEmail(email: string | null, note: string): Promise<boolean> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey || !email) return false;

  const leadId = await findCloseLeadIdByEmail(email);
  if (!leadId) return false;

  const res = await fetch(`${CLOSE_BASE}/activity/note/`, {
    method: 'POST',
    headers: closeHeaders(apiKey),
    body: JSON.stringify({ lead_id: leadId, note }),
  });
  if (!res.ok) throw new Error(`Close-Notiz fehlgeschlagen (${res.status})`);
  return true;
}

// ---------------------------------------------------------------------------
// No-Show aus Close: Opportunity-Status "Setting - No Show" → WhatsApp noshow_1_anruf
// ---------------------------------------------------------------------------

/** Opportunity-Status "Setting - No Show" in der Pipeline "D2D Sales". */
export const CLOSE_STATUS_SETTING_NO_SHOW = 'stat_0NNi8KdI13PSUkUiNv46IQ4kZS68xYyS6XqpQA8Oqe7';

/** Geheimer URL-Token für den Close-Webhook, abgeleitet aus CRON_SECRET (keine extra Env-Variable). */
export function closeWebhookToken(): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update('close-webhook').digest('hex').slice(0, 32);
}

export interface CloseLeadContacts {
  leadName: string | null;
  contactName: string | null;
  phones: string[];
  emails: string[];
}

/** Kontakte (Name, Telefonnummern, E-Mails) eines Close-Leads laden. */
export async function getCloseLeadContacts(leadId: string): Promise<CloseLeadContacts | null> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) return null;

  const res = await fetch(`${CLOSE_BASE}/lead/${encodeURIComponent(leadId)}/?_fields=display_name,contacts`, {
    headers: closeHeaders(apiKey),
  });
  if (!res.ok) throw new Error(`Close-Lead ${leadId} nicht lesbar (${res.status})`);

  const lead = (await res.json()) as {
    display_name?: string;
    contacts?: Array<{ name?: string; phones?: Array<{ phone: string }>; emails?: Array<{ email: string }> }>;
  };
  const contacts = lead.contacts ?? [];
  return {
    leadName: lead.display_name ?? null,
    contactName: contacts.find((c) => c.name)?.name ?? null,
    phones: contacts.flatMap((c) => c.phones?.map((p) => p.phone) ?? []),
    emails: contacts.flatMap((c) => c.emails?.map((e) => e.email) ?? []),
  };
}

/** Webhook-Abo in Close anlegen (idempotent: existiert die URL schon, wird nichts doppelt angelegt). */
export async function ensureCloseWebhook(url: string): Promise<{ id: string; created: boolean }> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) throw new Error('CLOSE_API_KEY fehlt');

  const list = await fetch(`${CLOSE_BASE}/webhook/`, { headers: closeHeaders(apiKey) });
  if (!list.ok) throw new Error(`Close-Webhooks nicht lesbar (${list.status})`);
  const { data } = (await list.json()) as { data: Array<{ id: string; url: string; status: string }> };
  const existing = data.find((w) => w.url === url);
  if (existing) return { id: existing.id, created: false };

  const res = await fetch(`${CLOSE_BASE}/webhook/`, {
    method: 'POST',
    headers: closeHeaders(apiKey),
    body: JSON.stringify({
      url,
      events: [{ object_type: 'opportunity', action: 'updated' }],
    }),
  });
  if (!res.ok) throw new Error(`Close-Webhook anlegen fehlgeschlagen (${res.status}): ${await res.text()}`);
  const created = (await res.json()) as { id: string };
  return { id: created.id, created: true };
}
