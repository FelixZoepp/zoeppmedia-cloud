import { beforeAll, describe, expect, it } from 'vitest';
import { baueState, freieZeiten, pruefeState } from '../kunden-kalender';

beforeAll(() => {
  process.env.CRON_SECRET = 'test-geheim';
});

describe('Kunden-Kalender', () => {
  it('State ist signiert und läuft nach 15 Min. ab', () => {
    const jetzt = Date.now();
    const s = baueState('ag-1', 'u-1', jetzt);
    expect(pruefeState(s, jetzt + 60_000)).toEqual({ agencyId: 'ag-1', userId: 'u-1' });
    expect(pruefeState(s, jetzt + 16 * 60_000)).toBeNull();
    expect(pruefeState(s.replace(/.$/, (c) => (c === 'a' ? 'b' : 'a')), jetzt)).toBeNull();
  });
  it('freie Zeiten: Mo–Fr 9–18 Uhr, ohne Belegungen, mit Vorlauf', () => {
    const jetzt = new Date('2026-10-12T05:00:00Z'); // Mo 7:00 Berlin
    const z = freieZeiten([{ starts_at: '2026-10-12T08:00:00Z', ends_at: '2026-10-12T10:00:00Z' }], { von: jetzt, tage: 1, minuten: 60, jetzt });
    const starts = z.map((x) => x.start.toISOString());
    expect(starts[0]).toBe('2026-10-12T07:00:00.000Z'); // 9:00
    expect(starts).not.toContain('2026-10-12T08:00:00.000Z'); // belegt 10–12
    expect(starts).not.toContain('2026-10-12T07:30:00.000Z'); // würde in die Belegung reichen
    expect(starts).toContain('2026-10-12T10:00:00.000Z'); // 12:00
    expect(starts[starts.length - 1]).toBe('2026-10-12T15:00:00.000Z'); // 17:00 (Ende 18:00)
  });
  it('Wochenende hat keine freien Zeiten', () => {
    const sa = new Date('2026-10-17T06:00:00Z');
    expect(freieZeiten([], { von: sa, tage: 2, minuten: 60, jetzt: sa })).toHaveLength(0);
  });
});
