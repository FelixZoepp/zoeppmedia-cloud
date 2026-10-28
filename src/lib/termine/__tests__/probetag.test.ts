import { describe, it, expect } from 'vitest';
import { probetagLabel, probetagTage, probetagZeiten } from '../probetag';

describe('probetag', () => {
  it('liest das Format aus den Einstellungen (Standard 1 Tag)', () => {
    expect(probetagTage({ probetag_tage: 3 })).toBe(3);
    expect(probetagTage({ probetag_tage: '5' })).toBe(5);
    expect(probetagTage({})).toBe(1);
    expect(probetagTage(null)).toBe(1);
    expect(probetagTage({ probetag_tage: 7 })).toBe(1);
  });

  it('Labels', () => {
    expect(probetagLabel(1)).toBe('Probetag');
    expect(probetagLabel(3)).toBe('3 Probetage');
    expect(probetagLabel(5)).toBe('Probewoche');
  });

  it('3 Probetage ab Donnerstag: Do, Fr, Mo – gleiche Uhrzeit', () => {
    const z = probetagZeiten(new Date('2026-10-29T08:00:00Z'), 3, 240);
    expect(z.map((x) => x.start.toISOString())).toEqual(['2026-10-29T08:00:00.000Z', '2026-10-30T08:00:00.000Z', '2026-11-02T08:00:00.000Z']);
    expect(z[0].ende.toISOString()).toBe('2026-10-29T12:00:00.000Z');
  });

  it('1 Tag = genau ein Termin', () => {
    expect(probetagZeiten(new Date('2026-10-31T08:00:00Z'), 1, 240)).toHaveLength(1);
  });
});
