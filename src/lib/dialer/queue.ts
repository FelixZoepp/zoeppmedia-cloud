/**
 * Anruf-Modus: Warteschlange aus Rohdaten bauen (rein, testbar).
 * Priorität bei Überschneidung: Erinnerung > Kadenz > Rückruf > Neu.
 * Übersprungen werden Bewerber ohne Nummer, gesperrte (Blacklist, gelöscht, „nicht kontaktieren“)
 * und solche, die gerade jemand anderes anruft.
 */

export type QueueReason = 'erinnerung' | 'kadenz' | 'rueckruf' | 'neu';

export interface DialerQueueItem {
  candidate_id: string;
  name: string;
  phone: string | null;
  agency_id: string;
  reason: QueueReason;
  cadence_attempt: number | null;
  cadence_window: string | null;
  callback_note: string | null;
  callback_date: string | null;
  appointment_id: string | null;
  appointment_type: 'vorstellungsgespraech' | 'probetag' | null;
  appointment_at: string | null;
  created_at: string;
}

export interface QueueCandidate {
  id: string;
  name: string;
  phone: string | null;
  agency_id: string;
  created_at: string;
  cadence_attempt?: number | null;
  cadence_next_window?: string | null;
  blacklisted?: boolean | null;
  deleted_at?: string | null;
  do_not_contact?: boolean | null;
  locked_by?: string | null;
  locked_until?: string | null;
}

export interface QueueReminder {
  id: string;
  candidate_id: string;
  agency_id: string;
  type: string;
  scheduled_at: string;
}

export interface QueueCallback {
  id: string;
  candidate_id: string;
  agency_id: string;
  notes: string | null;
  next_contact_date: string | null;
}

/** Darf dieser Bewerber jetzt von `userId` angerufen werden? */
export function anrufbar(c: QueueCandidate, userId: string, jetzt: Date): boolean {
  if (!c.phone || !c.phone.trim()) return false;
  if (c.blacklisted || c.deleted_at || c.do_not_contact) return false;
  if (c.locked_by && c.locked_by !== userId && c.locked_until && new Date(c.locked_until) > jetzt) return false;
  return true;
}

/** Rückrufe: nur den jeweils letzten Anruf-Log eines Bewerbers zählen */
export function offeneRueckrufe(callbacks: QueueCallback[], letzterLogJeBewerber: Record<string, string>): QueueCallback[] {
  return callbacks.filter((c) => letzterLogJeBewerber[c.candidate_id] === c.id);
}

export function baueWarteschlange(input: {
  reminders: QueueReminder[];
  cadence: QueueCandidate[];
  callbacks: QueueCallback[];
  neue: QueueCandidate[];
  /** Bewerber-Daten für Erinnerungen und Rückrufe */
  kandidaten: Record<string, QueueCandidate>;
  userId: string;
  jetzt: Date;
}): DialerQueueItem[] {
  const { userId, jetzt } = input;
  const queue = new Map<string, DialerQueueItem>();
  const leer = {
    cadence_attempt: null,
    cadence_window: null,
    callback_note: null,
    callback_date: null,
    appointment_id: null,
    appointment_type: null,
    appointment_at: null,
  };
  const basis = (c: QueueCandidate) => ({
    candidate_id: c.id,
    name: c.name,
    phone: c.phone,
    agency_id: c.agency_id,
    created_at: c.created_at,
  });

  for (const r of input.reminders) {
    const c = input.kandidaten[r.candidate_id];
    if (!c || queue.has(c.id) || !anrufbar(c, userId, jetzt)) continue;
    queue.set(c.id, {
      ...basis(c),
      ...leer,
      reason: 'erinnerung',
      agency_id: r.agency_id,
      appointment_id: r.id,
      appointment_type: r.type === 'probetag' ? 'probetag' : 'vorstellungsgespraech',
      appointment_at: r.scheduled_at,
    });
  }

  for (const c of input.cadence) {
    if (queue.has(c.id) || !anrufbar(c, userId, jetzt)) continue;
    queue.set(c.id, {
      ...basis(c),
      ...leer,
      reason: 'kadenz',
      cadence_attempt: c.cadence_attempt ?? 0,
      cadence_window: c.cadence_next_window ?? null,
    });
  }

  for (const cb of input.callbacks) {
    const c = input.kandidaten[cb.candidate_id];
    if (!c || queue.has(c.id) || !anrufbar(c, userId, jetzt)) continue;
    queue.set(c.id, {
      ...basis(c),
      ...leer,
      reason: 'rueckruf',
      agency_id: cb.agency_id,
      callback_note: cb.notes,
      callback_date: cb.next_contact_date,
    });
  }

  for (const c of input.neue) {
    if (queue.has(c.id) || !anrufbar(c, userId, jetzt)) continue;
    queue.set(c.id, { ...basis(c), ...leer, reason: 'neu' });
  }

  return [...queue.values()];
}

export function queueStats(items: DialerQueueItem[]) {
  return {
    total: items.length,
    erinnerungen: items.filter((i) => i.reason === 'erinnerung').length,
    kadenz: items.filter((i) => i.reason === 'kadenz').length,
    rueckrufe: items.filter((i) => i.reason === 'rueckruf').length,
    neue: items.filter((i) => i.reason === 'neu').length,
  };
}

/** Sperrdauer beim Öffnen eines Bewerbers im Anruf-Modus */
export const SPERRE_MINUTEN = 10;
