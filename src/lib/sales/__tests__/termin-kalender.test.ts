import { describe, it, expect } from 'vitest';
import { googleLink, icsDatei, outlookLink, terminArt } from '../termin-kalender';

const t = { id: 'ABC123def', art: 'setting' as const, start: '2026-10-07T12:00:00.000Z', ende: '2026-10-07T12:15:00.000Z' };

describe('Termin in den Kalender', () => {
  it('erkennt die Art', () => {
    expect(terminArt('60min Beratungsgespräch mit Felix Zoepp', null)).toBe('beratung');
    expect(terminArt('Analysegespräch mit Zoepp Media', null)).toBe('setting');
  });
  it('baut Google- und Outlook-Links', () => {
    expect(googleLink(t)).toContain('dates=20261007T120000Z%2F20261007T121500Z');
    expect(outlookLink(t)).toContain('startdt=2026-10-07T12%3A00%3A00.000Z');
  });
  it('baut eine gültige ICS-Datei', () => {
    const ics = icsDatei(t, new Date('2026-10-06T10:00:00Z'));
    expect(ics).toContain('DTSTART:20261007T120000Z');
    expect(ics).toContain('UID:ABC123def@zoeppmedia.de');
    expect(ics).toContain('LOCATION:Telefon – wir rufen dich an von 030 82684175');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
  });
});
