import { describe, it, expect } from 'vitest';
import { mapStatus, normalizeTermine, rasterPosition, wochenStart, isoTag, addTage } from '../normalize';

describe('normalizeTermine', () => {
  const termine = normalizeTermine(
    [
      { id: 'c1', candidate_id: 'k1', type: 'probetag', scheduled_at: '2026-10-08T07:00:00.000Z', status: 'geplant', notes: 'Arbeitskleidung' },
      { id: 'c2', candidate_id: 'k2', type: 'vorstellungsgespraech', scheduled_at: '2026-10-07T08:00:00.000Z', status: 'no_show', notes: null },
    ],
    [{ id: 'a1', application_id: 'app1', starts_at: '2026-10-07T07:30:00.000Z', ends_at: null, type: 'interview', location: 'Zoom', status: 'cancelled' }],
    new Map([['k1', 'Anna Berg'], ['k2', 'Ben Kurz'], ['k3', 'Cem Yilmaz']]),
    new Map([['app1', 'k3']]),
  );

  it('führt beide Systeme zusammen und sortiert nach Beginn', () => {
    expect(termine.map((t) => t.id)).toEqual(['a1', 'c2', 'c1']);
  });

  it('ergänzt Namen, Dauer, Label und Bearbeitbarkeit', () => {
    const vg = termine.find((t) => t.id === 'c2')!;
    expect(vg).toMatchObject({ candidate_name: 'Ben Kurz', typLabel: 'Vorstellungsgespräch', status: 'no_show', bearbeitbar: true });
    expect(vg.ende).toBe('2026-10-07T08:45:00.000Z');
    const buchung = termine.find((t) => t.id === 'a1')!;
    expect(buchung).toMatchObject({ candidate_id: 'k3', candidate_name: 'Cem Yilmaz', status: 'abgesagt', ort: 'Zoom', bearbeitbar: false });
  });
});

describe('mapStatus', () => {
  it('bildet englische und deutsche Werte ab', () => {
    expect(mapStatus('completed')).toBe('erschienen');
    expect(mapStatus('no-show')).toBe('no_show');
    expect(mapStatus('canceled')).toBe('abgesagt');
    expect(mapStatus(null)).toBe('geplant');
  });
});

describe('Datum-Helfer', () => {
  it('Wochenstart ist Montag', () => {
    const mo = wochenStart(new Date(2026, 9, 11)); // Sonntag 11.10.
    expect(isoTag(mo)).toBe('2026-10-05');
    expect(isoTag(addTage(mo, 6))).toBe('2026-10-11');
  });

  it('Rasterposition wird auf das Fenster begrenzt', () => {
    const s = new Date(2026, 9, 6, 9, 0).toISOString();
    const e = new Date(2026, 9, 6, 10, 30).toISOString();
    const p = rasterPosition(s, e, 7, 20)!;
    expect(p.top).toBeCloseTo((120 / 780) * 100);
    expect(p.height).toBeCloseTo((90 / 780) * 100);
    const früh = rasterPosition(new Date(2026, 9, 6, 5, 0).toISOString(), new Date(2026, 9, 6, 6, 0).toISOString(), 7, 20);
    expect(früh).toBeNull();
  });
});
