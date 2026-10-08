/** Gemeinsame Typen und Formatierer für die Inbox */

export interface InboxCandidate {
  id: string;
  name: string;
  phone_e164: string | null;
  email: string | null;
  source?: string | null;
  consent_source?: string | null;
  created_at?: string | null;
  location?: string | null;
  kunde_agency_id?: string | null;
  current_stage?: { name: string; color: string | null } | null;
}

export interface InboxConversation {
  id: string;
  state: string;
  window_expires_at: string | null;
  unread_count: number;
  last_message_at: string | null;
  assigned_to: string | null;
  candidate: InboxCandidate;
  application: Array<{ id: string; job: { title: string } | null; stage: { name: string; color: string } | null }> | null;
  last_message?: { body: string | null; type: string; direction: string; sender_type: string; created_at: string } | null;
  /** Sales-Inbox: Name des Kunden, wenn der Kontakt zu einem Kunden gehört */
  kunde_name?: string | null;
}

export type InboxKind = 'sales' | 'recruiting';

/** Automatisch aus einer eingehenden WhatsApp angelegt (siehe lib/whatsapp/unknown-contact) */
export const isNewFromWhatsApp = (c: InboxCandidate) => c.consent_source === 'whatsapp_inbound';

/** +4917612345678 → +49 176 1234 5678 */
export function formatPhone(e164: string | null | undefined): string {
  if (!e164) return '';
  const de = e164.match(/^\+49(1\d{2})(\d{3,4})(\d+)$/);
  if (de) return `+49 ${de[1]} ${de[2]} ${de[3]}`;
  const any = e164.match(/^\+(\d{2})(\d{3})(\d+)$/);
  return any ? `+${any[1]} ${any[2]} ${any[3]}` : e164;
}

export function formatListTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  const gestern = new Date(now);
  gestern.setDate(now.getDate() - 1);
  if (d.toDateString() === gestern.toDateString()) return 'Gestern';
  if (now.getTime() - d.getTime() < 6 * 864e5) return d.toLocaleDateString('de-DE', { weekday: 'short' });
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
}

export function previewText(m: InboxConversation['last_message']): string {
  if (!m) return '';
  const body =
    m.body?.trim() ||
    (m.type === 'image' ? '📷 Bild' : m.type === 'document' ? '📄 Dokument' : m.type === 'audio' ? '🎤 Sprachnachricht' : m.type === 'template' ? 'Vorlage' : '');
  const prefix = m.direction === 'out' ? (m.sender_type === 'bot' ? 'Bot: ' : 'Du: ') : '';
  return prefix + body;
}

export function windowCountdown(expiresAt: string | null): string | null {
  if (!expiresAt) return null;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  if (remaining <= 0) return null;
  const hours = Math.floor(remaining / 3600_000);
  const mins = Math.floor((remaining % 3600_000) / 60_000);
  return `${hours} h ${mins} min`;
}
