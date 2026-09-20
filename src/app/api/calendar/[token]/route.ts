import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * ICS-Kalender-Feed pro Agentur.
 * Der Kunde abonniert diese URL einmal in Google/Outlook/Apple Kalender —
 * alle VG- und Probetag-Termine erscheinen dann automatisch in seinem Kalender.
 * Auth: geheimer Token in der URL (agencies.calendar_feed_token).
 */

const TYPE_LABELS: Record<string, string> = {
  vorstellungsgespraech: 'Vorstellungsgespräch',
  probetag: 'Probetag',
};

// Dauer in Minuten
const DURATIONS: Record<string, number> = {
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

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!token || token.length < 16) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const admin = createAdminClient();

  const { data: agency } = await admin
    .from('agencies')
    .select('id, name')
    .eq('calendar_feed_token', token)
    .single();

  if (!agency) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Termine: ab 60 Tage zurück bis unbegrenzt in die Zukunft
  const from = new Date();
  from.setDate(from.getDate() - 60);

  const { data: appointments } = await admin
    .from('candidate_appointments')
    .select('id, type, scheduled_at, status, notes, created_at, candidates(name, phone)')
    .eq('agency_id', agency.id)
    .gte('scheduled_at', from.toISOString())
    .order('scheduled_at', { ascending: true });

  const now = icsDate(new Date());
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zoepp Media Cloud//Bewerber-Termine//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(`Bewerber-Termine — ${agency.name}`)}`,
    'X-WR-TIMEZONE:Europe/Berlin',
    // Clients bitten, häufiger zu aktualisieren (wird nicht von allen respektiert)
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  for (const appt of appointments ?? []) {
    const candidate = appt.candidates as unknown as { name: string; phone: string | null } | null;
    const start = new Date(appt.scheduled_at);
    const end = new Date(start.getTime() + (DURATIONS[appt.type] ?? 60) * 60000);
    const typeLabel = TYPE_LABELS[appt.type] ?? appt.type;

    const descriptionParts = [
      candidate?.phone ? `Telefon: ${candidate.phone}` : null,
      appt.notes ? `Notiz: ${appt.notes}` : null,
      'Termin aus Zoepp Media Cloud',
    ].filter(Boolean);

    lines.push(
      'BEGIN:VEVENT',
      `UID:${appt.id}@cloud.zoeppmedia.de`,
      `DTSTAMP:${now}`,
      `DTSTART:${icsDate(start)}`,
      `DTEND:${icsDate(end)}`,
      `SUMMARY:${icsEscape(`${typeLabel}: ${candidate?.name ?? 'Bewerber'}`)}`,
      `DESCRIPTION:${icsEscape(descriptionParts.join('\n'))}`,
      `STATUS:${appt.status === 'abgesagt' ? 'CANCELLED' : 'CONFIRMED'}`,
      'END:VEVENT'
    );
  }

  lines.push('END:VCALENDAR');

  return new NextResponse(lines.join('\r\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="bewerber-termine.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
