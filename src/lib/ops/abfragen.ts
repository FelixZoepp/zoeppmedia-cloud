/**
 * Abfragen der wichtigsten Seiten – von den Routen UND vom System-Wächter benutzt.
 * So prüft der Wächter genau das, was die Cloud wirklich abfragt (z. B. mehrdeutige Verknüpfungen nach einer Migration).
 */

/** Inbox-Liste (/api/conversations) */
export const INBOX_LISTE_SELECT = `
      id, state, window_expires_at, unread_count, last_message_at, assigned_to,
      candidate:candidates!inner(id, name, phone_e164, email, source, consent_source, created_at, location, kunde_agency_id, current_stage:pipeline_stages!candidates_current_stage_id_fkey(name, color, stage_type)),
      application:applications(id, job:jobs(title), stage:pipeline_stages(name, color, stage_type))
    `;

/** Chatverlauf (/api/conversations/[id]/messages) */
export const CHAT_NACHRICHTEN_SELECT = 'id, direction, sender_type, user_id, type, body, media_path, wa_message_id, status, error_code, template_id, created_at';

/** Bewerberliste (/api/candidates) */
export const BEWERBER_LISTE_SELECT = '*, current_stage:pipeline_stages!candidates_current_stage_id_fkey(*)';

/** Bewerbungen (/api/applications) */
export const BEWERBUNGEN_SELECT = `
      *,
      candidate:candidates(id, name, phone, phone_e164, email, source, persona_typ, persona_fit),
      job:jobs(id, title, slug),
      stage:pipeline_stages(id, name, color, stage_type)
    `;
