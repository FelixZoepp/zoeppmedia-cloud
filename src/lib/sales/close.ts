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
  display_name?: string;
  contacts?: Array<{ id?: string; name?: string; emails?: Array<{ email: string }>; phones?: Array<{ phone: string }> }>;
}

function digits(phone: string): string {
  const d = phone.replace(/\D/g, '');
  // 0049… / 49… / 0… auf die nationale Nummer ohne führende 0 reduzieren (für den Vergleich)
  return d.replace(/^00/, '').replace(/^49/, '').replace(/^0/, '');
}

async function searchLeads(apiKey: string, query: string): Promise<CloseLead[]> {
  const params = new URLSearchParams({ query, _fields: 'id,display_name,contacts', _limit: '10' });
  // contacts enthält id, phones, emails — für die Zuordnung von WhatsApp-Aktivitäten
  const res = await fetch(`${CLOSE_BASE}/lead/?${params}`, { headers: closeHeaders(apiKey) });
  if (!res.ok) throw new Error(`Close-Suche fehlgeschlagen (${res.status})`);
  return ((await res.json()) as { data: CloseLead[] }).data;
}

/** Lead-ID zur E-Mail finden (Volltextsuche, danach exakter Abgleich der Kontakt-E-Mails). */
export async function findCloseLeadIdByEmail(email: string): Promise<string | null> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey || !email) return null;
  const needle = email.toLowerCase();
  const leads = await searchLeads(apiKey, `"${email}"`);
  return (
    leads.find((l) => l.contacts?.some((c) => c.emails?.some((e) => e.email.toLowerCase() === needle)))?.id ?? null
  );
}

/** Lead-ID zur Telefonnummer finden (Volltextsuche, danach Abgleich der Ziffern). */
export async function findCloseLeadIdByPhone(phone: string): Promise<string | null> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey || !phone) return null;
  const needle = digits(phone);
  if (needle.length < 6) return null;
  // Nationale Ziffern (ohne +49/0) — so findet die Close-Volltextsuche Nummern in jedem Format
  const leads = await searchLeads(apiKey, needle);
  return leads.find((l) => l.contacts?.some((c) => c.phones?.some((p) => digits(p.phone) === needle)))?.id ?? null;
}

const normName = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Lead-ID zum Namen einer Person finden (Kontaktname oder Lead-Name muss alle Namensteile enthalten). */
export async function findCloseLeadIdByName(name: string): Promise<string | null> {
  const apiKey = process.env.CLOSE_API_KEY;
  const needle = normName(name ?? '');
  if (!apiKey || needle.split(' ').length < 2) return null;
  // Mit und ohne Akzente suchen („Miró“ ↔ „Miro“)
  const ascii = name.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const gefunden = await searchLeads(apiKey, `"${name.trim()}"`);
  const leads = ascii !== name.trim() ? [...gefunden, ...(await searchLeads(apiKey, `"${ascii}"`))] : gefunden;
  const teile = needle.split(' ');
  const passt = (s?: string) => !!s && teile.every((t) => normName(s).split(' ').includes(t));
  const eindeutig = (liste: CloseLead[]) => [...new Map(liste.map((l) => [l.id, l])).values()];
  const treffer = eindeutig(leads.filter((l) => l.contacts?.some((c) => passt(c.name)) || passt(l.display_name)));
  // Nur eindeutige Treffer – lieber keine Notiz als eine am falschen Lead
  if (treffer.length === 1) return treffer[0].id;
  if (treffer.length > 1) return null;
  // Rückfall: nur der Nachname, wenn er genau einen Lead trifft (z. B. Firma „TRAPP management“)
  const nachname = teile[teile.length - 1];
  if (nachname.length < 4) return null;
  const nachNach = eindeutig([...leads, ...(await searchLeads(apiKey, `"${nachname}"`))]).filter(
    (l) => normName(l.display_name ?? '').split(' ').includes(nachname) || l.contacts?.some((c) => normName(c.name ?? '').split(' ').includes(nachname)),
  );
  return nachNach.length === 1 ? nachNach[0].id : null;
}

/** Notiz direkt an einen bekannten Lead schreiben – gibt die Notiz-ID zurück. */
export async function addCloseNote(leadId: string, note: string): Promise<string | null> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) throw new Error('CLOSE_API_KEY fehlt');
  const res = await fetch(`${CLOSE_BASE}/activity/note/`, {
    method: 'POST',
    headers: closeHeaders(apiKey),
    body: JSON.stringify({ lead_id: leadId, note }),
  });
  if (!res.ok) throw new Error(`Close-Notiz fehlgeschlagen (${res.status})`);
  return ((await res.json()) as { id?: string }).id ?? null;
}

/** Bestehende Notiz ersetzen */
export async function updateCloseNote(noteId: string, note: string): Promise<void> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) throw new Error('CLOSE_API_KEY fehlt');
  const res = await fetch(`${CLOSE_BASE}/activity/note/${noteId}/`, { method: 'PUT', headers: closeHeaders(apiKey), body: JSON.stringify({ note }) });
  if (!res.ok) throw new Error(`Close-Notiz nicht aktualisiert (${res.status})`);
}

/** Notizen eines Leads (für das nachträgliche Kürzen alter Analyse-Notizen) */
export async function ladeCloseNotizen(leadId: string): Promise<Array<{ id: string; note: string }>> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) throw new Error('CLOSE_API_KEY fehlt');
  const res = await fetch(`${CLOSE_BASE}/activity/note/?lead_id=${leadId}&_fields=id,note&_limit=100`, { headers: closeHeaders(apiKey) });
  if (!res.ok) throw new Error(`Close-Notizen nicht ladbar (${res.status})`);
  return ((await res.json()) as { data: Array<{ id: string; note: string }> }).data;
}

/** Lead + Kontakt zur Telefonnummer (sonst E-Mail) finden — Ziel für WhatsApp-Aktivitäten. */
export async function findCloseContact(contact: {
  phone?: string | null;
  email?: string | null;
}): Promise<{ leadId: string; contactId: string } | null> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) return null;

  if (contact.phone) {
    const needle = digits(contact.phone);
    if (needle.length >= 6) {
      for (const lead of await searchLeads(apiKey, needle)) {
        const c = lead.contacts?.find((x) => x.phones?.some((p) => digits(p.phone) === needle));
        if (c?.id) return { leadId: lead.id, contactId: c.id };
      }
    }
  }
  if (contact.email) {
    const needle = contact.email.toLowerCase();
    for (const lead of await searchLeads(apiKey, `"${contact.email}"`)) {
      const c = lead.contacts?.find((x) => x.emails?.some((e) => e.email.toLowerCase() === needle));
      if (c?.id) return { leadId: lead.id, contactId: c.id };
    }
  }
  return null;
}

/** WhatsApp-Nachricht als Aktivität am Close-Lead ablegen (eingehend → auch in die Close-Inbox). */
export async function createCloseWhatsAppActivity(input: {
  leadId: string;
  contactId: string;
  direction: 'incoming' | 'outgoing';
  externalId: string;
  text: string;
  localPhone: string;
  remotePhone: string;
  at: string;
}): Promise<string> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) throw new Error('CLOSE_API_KEY fehlt');

  const query = input.direction === 'incoming' ? '?send_to_inbox=true' : '';
  const res = await fetch(`${CLOSE_BASE}/activity/whatsapp_message/${query}`, {
    method: 'POST',
    headers: closeHeaders(apiKey),
    body: JSON.stringify({
      lead_id: input.leadId,
      contact_id: input.contactId,
      direction: input.direction,
      external_whatsapp_message_id: input.externalId,
      message_markdown: input.text,
      local_phone: input.localPhone.replace(/\D/g, ''),
      remote_phone: input.remotePhone.replace(/\D/g, ''),
      activity_at: input.at,
    }),
  });
  if (!res.ok) throw new Error(`Close-WhatsApp-Aktivität fehlgeschlagen (${res.status}): ${await res.text()}`);
  return ((await res.json()) as { id: string }).id;
}

/** Lead über E-Mail, sonst Telefon finden. */
export async function findCloseLeadId(contact: { email?: string | null; phone?: string | null }): Promise<string | null> {
  if (contact.email) {
    const byEmail = await findCloseLeadIdByEmail(contact.email);
    if (byEmail) return byEmail;
  }
  return contact.phone ? findCloseLeadIdByPhone(contact.phone) : null;
}

/** Aufgabe am Close-Lead anlegen (fällig an `date`, YYYY-MM-DD). Gibt die Lead-ID zurück oder null. */
export async function addCloseTask(
  contact: { email?: string | null; phone?: string | null },
  text: string,
  date: string,
): Promise<string | null> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) return null;
  const leadId = await findCloseLeadId(contact);
  if (!leadId) return null;

  const res = await fetch(`${CLOSE_BASE}/task/`, {
    method: 'POST',
    headers: closeHeaders(apiKey),
    body: JSON.stringify({ _type: 'lead', lead_id: leadId, text, date }),
  });
  if (!res.ok) throw new Error(`Close-Aufgabe fehlgeschlagen (${res.status})`);
  return leadId;
}

/** Aufgabe direkt an einem bekannten Lead (fällig an `date`, YYYY-MM-DD). */
export async function addCloseTaskForLead(leadId: string, text: string, date: string): Promise<void> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) throw new Error('CLOSE_API_KEY fehlt');
  const res = await fetch(`${CLOSE_BASE}/task/`, {
    method: 'POST',
    headers: closeHeaders(apiKey),
    body: JSON.stringify({ _type: 'lead', lead_id: leadId, text, date }),
  });
  if (!res.ok) throw new Error(`Close-Aufgabe fehlgeschlagen (${res.status})`);
}

/** Lead mit Kontakten und Leadquelle laden (für Eintragungen) */
export async function ladeCloseLead(leadId: string): Promise<{ id: string; name: string; email: string | null; phone: string | null; quelle: string | null; erstellt: string } | null> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) return null;
  const res = await fetch(`${CLOSE_BASE}/lead/${leadId}/?_fields=id,display_name,contacts,date_created,custom.cf_QiH8TTQXCkFg846D3N4qPF6STvbww7q3WJAK3Qja0n8`, {
    headers: closeHeaders(apiKey),
  });
  if (!res.ok) return null;
  const l = (await res.json()) as {
    id: string;
    display_name?: string;
    date_created: string;
    contacts?: Array<{ name?: string; emails?: Array<{ email: string }>; phones?: Array<{ phone: string }> }>;
    [k: string]: unknown;
  };
  const c = l.contacts?.[0];
  return {
    id: l.id,
    name: c?.name || l.display_name || 'Lead',
    email: c?.emails?.[0]?.email ?? null,
    phone: c?.phones?.[0]?.phone ?? null,
    quelle: (l['custom.cf_QiH8TTQXCkFg846D3N4qPF6STvbww7q3WJAK3Qja0n8'] as string | undefined) ?? null,
    erstellt: l.date_created,
  };
}

/** Notiz am Close-Lead des Prospects anlegen. Gibt true zurück, wenn eine Notiz geschrieben wurde. */
export async function addCloseNoteByEmail(email: string | null, note: string, phone?: string | null): Promise<boolean> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey || (!email && !phone)) return false;

  const leadId = await findCloseLeadId({ email, phone });
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

const WEBHOOK_EVENTS = [
  { object_type: 'opportunity', action: 'created' },
  { object_type: 'opportunity', action: 'updated' },
  // Neue Leads (Eintragungen) → 10-Minuten-Check auf Terminbuchung
  { object_type: 'lead', action: 'created' },
];

/** Webhook-Abo in Close anlegen bzw. auf die aktuellen Events bringen (idempotent). */
export async function ensureCloseWebhook(url: string): Promise<{ id: string; created: boolean }> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) throw new Error('CLOSE_API_KEY fehlt');

  const list = await fetch(`${CLOSE_BASE}/webhook/`, { headers: closeHeaders(apiKey) });
  if (!list.ok) throw new Error(`Close-Webhooks nicht lesbar (${list.status})`);
  const { data } = (await list.json()) as { data: Array<{ id: string; url: string; status: string }> };
  const existing = data.find((w) => w.url === url);
  if (existing) {
    const upd = await fetch(`${CLOSE_BASE}/webhook/${existing.id}/`, {
      method: 'PUT',
      headers: closeHeaders(apiKey),
      body: JSON.stringify({ events: WEBHOOK_EVENTS, status: 'active' }),
    });
    if (!upd.ok) throw new Error(`Close-Webhook aktualisieren fehlgeschlagen (${upd.status}): ${await upd.text()}`);
    return { id: existing.id, created: false };
  }

  const res = await fetch(`${CLOSE_BASE}/webhook/`, {
    method: 'POST',
    headers: closeHeaders(apiKey),
    body: JSON.stringify({ url, events: WEBHOOK_EVENTS }),
  });
  if (!res.ok) throw new Error(`Close-Webhook anlegen fehlgeschlagen (${res.status}): ${await res.text()}`);
  const created = (await res.json()) as { id: string };
  return { id: created.id, created: true };
}

// ---------------------------------------------------------------------------
// Follow-ups: Opportunity-Feld "Follow-up-Rhythmus"
// ---------------------------------------------------------------------------

export const FOLLOWUP_FIELD_NAME = 'Follow-up-Rhythmus';
export const FOLLOWUP_CHOICES = ['1 Woche', '2 Wochen', '1 Monat', '3 Monate', 'Aus'] as const;

/** Opportunity-Status, in denen die Follow-up-Kette läuft. */
export const CLOSE_FOLLOWUP_STATUS_IDS = [
  'stat_EWpujNpwdtq5HSFAMO6c0awZUVgsz6TfO1ZXe5Ff8IT', // Setting - Follow Up
  'stat_qdOAuGHxRx66Mk45E58gOOXnceL04Iouh6nAuoEXyjy', // Closing - Follow Up
];

let followupFieldIdCache: string | null = null;

async function listOpportunityFields(apiKey: string): Promise<Array<{ id: string; name: string }>> {
  const res = await fetch(`${CLOSE_BASE}/custom_field/opportunity/`, { headers: closeHeaders(apiKey) });
  if (!res.ok) throw new Error(`Close-Felder nicht lesbar (${res.status})`);
  return ((await res.json()) as { data: Array<{ id: string; name: string }> }).data;
}

/** ID des Feldes "Follow-up-Rhythmus" (gecacht). */
export async function getFollowupFieldId(): Promise<string | null> {
  if (followupFieldIdCache) return followupFieldIdCache;
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) return null;
  const field = (await listOpportunityFields(apiKey)).find((f) => f.name === FOLLOWUP_FIELD_NAME);
  followupFieldIdCache = field?.id ?? null;
  return followupFieldIdCache;
}

/** Feld "Follow-up-Rhythmus" an Opportunities anlegen, falls es fehlt. */
export async function ensureFollowupField(): Promise<{ id: string; created: boolean }> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) throw new Error('CLOSE_API_KEY fehlt');
  const existing = (await listOpportunityFields(apiKey)).find((f) => f.name === FOLLOWUP_FIELD_NAME);
  if (existing) return { id: existing.id, created: false };

  const res = await fetch(`${CLOSE_BASE}/custom_field/opportunity/`, {
    method: 'POST',
    headers: closeHeaders(apiKey),
    body: JSON.stringify({
      name: FOLLOWUP_FIELD_NAME,
      type: 'choices',
      choices: FOLLOWUP_CHOICES,
      accepts_multiple_values: false,
      description: 'WhatsApp-Follow-ups (Zoepp Cloud): läuft, solange die Opportunity auf "… - Follow Up" steht.',
    }),
  });
  if (!res.ok) throw new Error(`Close-Feld anlegen fehlgeschlagen (${res.status}): ${await res.text()}`);
  const created = (await res.json()) as { id: string };
  followupFieldIdCache = created.id;
  return { id: created.id, created: true };
}

export interface CloseOpportunity {
  id: string;
  leadId: string;
  leadName: string | null;
  statusId: string;
  statusLabel: string | null;
  rhythm: string | null;
}

/** Opportunity mit Status und Follow-up-Rhythmus laden. */
export async function getCloseOpportunity(opportunityId: string): Promise<CloseOpportunity | null> {
  const apiKey = process.env.CLOSE_API_KEY;
  if (!apiKey) return null;
  const res = await fetch(`${CLOSE_BASE}/opportunity/${encodeURIComponent(opportunityId)}/`, {
    headers: closeHeaders(apiKey),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Close-Opportunity ${opportunityId} nicht lesbar (${res.status})`);
  const o = (await res.json()) as Record<string, unknown>;
  const fieldId = await getFollowupFieldId();
  const raw = fieldId ? o[`custom.${fieldId}`] : null;
  return {
    id: o.id as string,
    leadId: o.lead_id as string,
    leadName: (o.lead_name as string) ?? null,
    statusId: o.status_id as string,
    statusLabel: (o.status_label as string) ?? null,
    rhythm: typeof raw === 'string' ? raw : null,
  };
}
