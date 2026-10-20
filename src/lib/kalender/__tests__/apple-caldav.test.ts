import { describe, expect, it } from 'vitest';
import { baueIcs, belegtAusIcs, hrefIn, icsZeit, istIcloudUrl, kalenderAusAntwort, verschiebeIcs, waehleKalender } from '../apple-caldav';

describe('Apple-Kalender (CalDAV)', () => {
  it('nur iCloud-Adressen per https', () => {
    expect(istIcloudUrl('https://p42-caldav.icloud.com/123/calendars/')).toBe(true);
    expect(istIcloudUrl('http://caldav.icloud.com/')).toBe(false);
    expect(istIcloudUrl('https://evil.com/?x=icloud.com')).toBe(false);
    expect(istIcloudUrl('https://icloud.com.evil.com/')).toBe(false);
  });

  it('liest Principal und Kalender-Stamm (beliebiges Namensraum-Präfix)', () => {
    const xml = '<multistatus xmlns="DAV:"><response><href>/</href><propstat><prop><current-user-principal><href>/123456/principal/</href></current-user-principal></prop></propstat></response></multistatus>';
    expect(hrefIn(xml, 'current-user-principal')).toBe('/123456/principal/');
    const xml2 = '<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:response><d:propstat><d:prop><c:calendar-home-set><d:href>https://p42-caldav.icloud.com:443/123456/calendars/</d:href></c:calendar-home-set></d:prop></d:propstat></d:response></d:multistatus>';
    expect(hrefIn(xml2, 'calendar-home-set')).toBe('https://p42-caldav.icloud.com:443/123456/calendars/');
  });

  it('findet Termin-Kalender, lässt Erinnerungen und Nicht-Kalender aus', () => {
    const xml = `<multistatus xmlns="DAV:" xmlns:C="urn:ietf:params:xml:ns:caldav">
      <response><href>/1/calendars/</href><propstat><prop><resourcetype><collection/></resourcetype></prop></propstat></response>
      <response><href>/1/calendars/home/</href><propstat><prop><resourcetype><collection/><C:calendar/></resourcetype><displayname>Privat</displayname>
        <current-user-privilege-set><privilege><read/></privilege><privilege><write/></privilege></current-user-privilege-set>
        <C:supported-calendar-component-set><C:comp name="VEVENT"/></C:supported-calendar-component-set></prop></propstat></response>
      <response><href>/1/calendars/tasks/</href><propstat><prop><resourcetype><collection/><C:calendar/></resourcetype><displayname>Erinnerungen</displayname>
        <C:supported-calendar-component-set><C:comp name="VTODO"/></C:supported-calendar-component-set></prop></propstat></response>
      <response><href>/1/calendars/feiertage/</href><propstat><prop><resourcetype><collection/><C:calendar/></resourcetype><displayname>Feiertage</displayname>
        <current-user-privilege-set><privilege><read/></privilege></current-user-privilege-set></prop></propstat></response>
    </multistatus>`;
    const k = kalenderAusAntwort(xml, 'https://p42-caldav.icloud.com/1/calendars/');
    expect(k.map((x) => x.name)).toEqual(['Privat', 'Feiertage']);
    expect(k[0].url).toBe('https://p42-caldav.icloud.com/1/calendars/home/');
    expect(waehleKalender(k)?.name).toBe('Privat');
  });

  it('belegte Zeiten: UTC, Berliner Ortszeit, ganztägig; frei/abgesagt zählt nicht', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'DTSTART:20261021T080000Z', 'DTEND:20261021T090000Z', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;TZID=Europe/Berlin:20261021T140000', 'DTEND;TZID=Europe/Berlin:20261021T150000', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261022', 'DTEND;VALUE=DATE:20261023', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20261021T100000Z', 'DTEND:20261021T110000Z', 'TRANSP:TRANSPARENT', 'END:VEVENT',
      'BEGIN:VEVENT', 'DTSTART:20261021T120000Z', 'DURATION:PT30M', 'STATUS:CANCELLED', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');
    expect(belegtAusIcs(ics)).toEqual([
      { starts_at: '2026-10-21T08:00:00.000Z', ends_at: '2026-10-21T09:00:00.000Z' },
      { starts_at: '2026-10-21T12:00:00.000Z', ends_at: '2026-10-21T13:00:00.000Z' },
      { starts_at: '2026-10-21T22:00:00.000Z', ends_at: '2026-10-22T22:00:00.000Z' },
    ]);
    expect(icsZeit('DTSTART;TZID=Europe/Berlin:20260115T090000')?.zeit.toISOString()).toBe('2026-01-15T08:00:00.000Z');
  });

  it('baut und verschiebt Termine', () => {
    const ics = baueIcs('abc@cloud.zoeppmedia.de', { start: new Date('2026-10-21T08:00:00Z'), ende: new Date('2026-10-21T09:00:00Z'), titel: 'Vorstellungsgespräch, Max', beschreibung: 'Zeile 1\nZeile 2' }, new Date('2026-10-20T00:00:00Z'));
    expect(ics).toContain('DTSTART:20261021T080000Z');
    expect(ics).toContain('SUMMARY:Vorstellungsgespräch\\, Max');
    expect(ics).toContain('DESCRIPTION:Zeile 1\\nZeile 2');
    expect(ics).not.toContain('ATTENDEE');
    const neu = verschiebeIcs(ics, new Date('2026-10-22T10:00:00Z'), new Date('2026-10-22T11:00:00Z'));
    expect(neu).toContain('DTSTART:20261022T100000Z');
    expect(neu).toContain('DTEND:20261022T110000Z');
    expect(neu).toContain('UID:abc@cloud.zoeppmedia.de');
  });
});
