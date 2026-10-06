/**
 * „Zum Kalender hinzufügen“ für Sales-Termine (Calendly-Buchungen):
 * Google- und Outlook-Links sowie eine .ics-Datei für Apple/alle anderen.
 * Rein (keine I/O) – damit testbar.
 */

export interface SalesTermin {
  id: string;
  art: 'setting' | 'beratung';
  start: string;
  ende: string;
}

export const SALES_TELEFON_ANZEIGE = '030 82684175';

export function terminArt(eventTypeName: string | null, eventName: string | null): 'setting' | 'beratung' {
  const t = `${eventTypeName ?? ''} ${eventName ?? ''}`.toLowerCase();
  return t.includes('beratung') ? 'beratung' : 'setting';
}

export function terminText(art: SalesTermin['art']) {
  return art === 'beratung'
    ? {
        titel: 'Beratungsgespräch mit Felix Zoepp',
        ort: 'Zoom (den Link bekommst du 1 Stunde vorher per WhatsApp)',
        beschreibung:
          'Beratungsgespräch mit Felix Zoepp (Zoepp Media), 60 Minuten per Zoom. Bitte nimm am Laptop oder PC teil, an einem ruhigen Ort mit Kamera. Den Zoom-Link bekommst du eine Stunde vor dem Termin per WhatsApp.',
      }
    : {
        titel: 'Erstgespräch mit Zoepp Media',
        ort: `Telefon – wir rufen dich an von ${SALES_TELEFON_ANZEIGE}`,
        beschreibung: `Erstgespräch mit Felix von Zoepp Media. Wir rufen dich zum Termin an, und zwar von ${SALES_TELEFON_ANZEIGE}. Am besten suchst du dir vorher einen ruhigen Ort.`,
      };
}

/** 2026-10-07T12:00:00.000Z → 20261007T120000Z */
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function googleLink(t: SalesTermin): string {
  const x = terminText(t.art);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: x.titel, dates: `${utc(t.start)}/${utc(t.ende)}`, details: x.beschreibung, location: x.ort });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

export function outlookLink(t: SalesTermin): string {
  const x = terminText(t.art);
  const q = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: x.titel,
    startdt: new Date(t.start).toISOString(),
    enddt: new Date(t.ende).toISOString(),
    body: x.beschreibung,
    location: x.ort,
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${q.toString()}`;
}

/** ICS-Text escapen (RFC 5545) */
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

export function icsDatei(t: SalesTermin, jetzt: Date = new Date()): string {
  const x = terminText(t.art);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zoepp Media//Termin//DE',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${t.id}@zoeppmedia.de`,
    `DTSTAMP:${utc(jetzt.toISOString())}`,
    `DTSTART:${utc(t.start)}`,
    `DTEND:${utc(t.ende)}`,
    `SUMMARY:${esc(x.titel)}`,
    `DESCRIPTION:${esc(x.beschreibung)}`,
    `LOCATION:${esc(x.ort)}`,
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    `DESCRIPTION:${esc(x.titel)}`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}
