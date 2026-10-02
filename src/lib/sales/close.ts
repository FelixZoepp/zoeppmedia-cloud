/**
 * Close-Anbindung für die Sales-Kette (best effort).
 * Sucht den Lead über die E-Mail des Prospects und hängt eine Notiz an.
 * Kein Lead gefunden oder kein API-Key → still überspringen.
 */

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
