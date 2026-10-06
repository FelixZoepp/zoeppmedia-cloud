import { describe, it, expect } from 'vitest';
import { ansehenLink, bauLiveBewerber, klemmeSeit, quelleLabel, siehtLiveBewerber, wannText } from '../bewerber';

const jetzt = new Date('2026-10-06T12:00:00Z');

describe('live bewerber', () => {
  it('Quellen auf Deutsch', () => {
    expect(quelleLabel('meta')).toBe('Meta-Anzeige');
    expect(quelleLabel('indeed_apply')).toBe('Indeed');
    expect(quelleLabel('manual')).toBe('Manuell');
    expect(quelleLabel('csv')).toBe('CSV-Import');
    expect(quelleLabel(null)).toBe('Unbekannt');
  });

  it('klemmt seit auf max. 10 Minuten, Standard 2 Minuten', () => {
    expect(klemmeSeit(null, jetzt)).toBe('2026-10-06T11:58:00.000Z');
    expect(klemmeSeit('2026-10-06T10:00:00Z', jetzt)).toBe('2026-10-06T11:50:00.000Z');
    expect(klemmeSeit('2026-10-06T11:55:00Z', jetzt)).toBe('2026-10-06T11:55:00.000Z');
    expect(klemmeSeit('2026-10-06T13:00:00Z', jetzt)).toBe('2026-10-06T12:00:00.000Z');
  });

  it('baut die Liste: neueste zuletzt, Stelle aus Bewerbung vor Indeed/Meta', () => {
    const r = bauLiveBewerber(
      [
        { id: 'b', name: 'Bea', created_at: '2026-10-06T11:59:00Z', source: 'indeed', indeed_job_title: 'Vertrieb', meta_campaign: null, agency_id: 'a1' },
        { id: 'a', name: ' ', created_at: '2026-10-06T11:58:00Z', source: 'meta', indeed_job_title: null, meta_campaign: 'Kampagne X', agency_id: 'a1' },
      ],
      new Map([['b', 'Außendienst']]),
      new Map([['a1', { name: 'Turhan', logo_url: null }]]),
    );
    expect(r.map((x) => x.id)).toEqual(['a', 'b']);
    expect(r[0]).toMatchObject({ name: 'Unbekannt', quelle: 'Meta-Anzeige', stelle: 'Kampagne X', agency: { name: 'Turhan' } });
    expect(r[1].stelle).toBe('Außendienst');
  });

  it('Ansehen-Link und Sichtbarkeit je Rolle', () => {
    const b = { id: 'c1', agency: { id: 'a1', name: 'X', logo_url: null } };
    expect(ansehenLink(b, { role: 'agency_owner' })).toBe('/candidates/c1');
    expect(ansehenLink(b, { role: 'employee', funktion: 'csm' })).toBe('/clients/a1');
    expect(ansehenLink(b, { role: 'admin' })).toBe('/api/admin/impersonate?agency=a1&ziel=%2Fcandidates%2Fc1');
    expect(siehtLiveBewerber({ role: 'agency_viewer' })).toBe(true);
    expect(siehtLiveBewerber({ role: 'employee', funktion: 'innendienst' })).toBe(true);
    expect(siehtLiveBewerber({ role: 'employee', funktion: 'setter' })).toBe(false);
  });

  it('Zeittext', () => {
    expect(wannText('2026-10-06T11:59:40Z', jetzt.getTime())).toBe('gerade eben');
    expect(wannText('2026-10-06T11:58:00Z', jetzt.getTime())).toBe('vor 2 Min.');
  });
});
