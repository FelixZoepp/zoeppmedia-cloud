/**
 * ICS-Kalender-Einladungen (METHOD:REQUEST / CANCEL).
 * Werden als Mail-Anhang verschickt — Gmail/Outlook/Apple tragen den Termin
 * sofort in den Kalender ein (im Gegensatz zum Abo-Feed, der verzögert aktualisiert).
 */

export const APPOINTMENT_TYPE_LABELS: Record<string, string> = {
  vorstellungsgespraech: 'Vorstellungsgespräch',
  probetag: 'Probetag',
};

// Dauer in Minuten
export const APPOINTMENT_DURATIONS: Record<string, number> = {
  vorstellungsgespraech: 60,
  probetag: 480,
};

function icsEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function icsDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

export function buildAppointmentInvite(opts: {
  appointmentId: string;
  type: string;
  scheduledAt: Date;
  sequence: number;
  method: 'REQUEST' | 'CANCEL';
  candidateName: string;
  candidatePhone: string | null;
  notes: string | null;
  agencyName: string;
  attendeeEmail: string;
  attendeeName: string;
}): string {
  const typeLabel = APPOINTMENT_TYPE_LABELS[opts.type] ?? opts.type;
  const end = new Date(
    opts.scheduledAt.getTime() + (APPOINTMENT_DURATIONS[opts.type] ?? 60) * 60000
  );

  const descriptionParts = [
    opts.candidatePhone ? `Telefon: ${opts.candidatePhone}` : null,
    opts.notes ? `Notiz: ${opts.notes}` : null,
    `Termin von ${opts.agencyName} (Zoepp Media Cloud)`,
  ].filter(Boolean);

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zoepp Media Cloud//Bewerber-Termine//DE',
    'CALSCALE:GREGORIAN',
    `METHOD:${opts.method}`,
    'BEGIN:VEVENT',
    `UID:${opts.appointmentId}@cloud.zoeppmedia.de`,
    `SEQUENCE:${opts.sequence}`,
    `DTSTAMP:${icsDate(new Date())}`,
    `DTSTART:${icsDate(opts.scheduledAt)}`,
    `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsEscape(`${typeLabel}: ${opts.candidateName}`)}`,
    `DESCRIPTION:${icsEscape(descriptionParts.join('\n'))}`,
    `ORGANIZER;CN=${icsEscape(opts.agencyName)}:mailto:noreply@zoepp-gruppe.de`,
    `ATTENDEE;CN=${icsEscape(opts.attendeeName)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${opts.attendeeEmail}`,
    `STATUS:${opts.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
