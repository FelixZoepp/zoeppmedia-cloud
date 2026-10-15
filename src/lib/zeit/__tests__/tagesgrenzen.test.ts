import { describe, expect, it } from 'vitest';
import { berlinTagesGrenzen, berlinTagVon, istGueltigerTag, tageInklusive, tagPlus, vorperiode } from '../berlin';

describe('berlinTagesGrenzen', () => {
  it('Sommerzeit: 00:00 bis 23:59:59.999 Uhr Berlin (UTC+2)', () => {
    expect(berlinTagesGrenzen('2026-09-01', '2026-09-30')).toEqual({
      ab: '2026-08-31T22:00:00.000Z',
      bis: '2026-09-30T21:59:59.999Z',
    });
  });

  it('Winterzeit: UTC+1', () => {
    expect(berlinTagesGrenzen('2026-12-01', '2026-12-31')).toEqual({
      ab: '2026-11-30T23:00:00.000Z',
      bis: '2026-12-31T22:59:59.999Z',
    });
  });

  it('Umstellung auf Sommerzeit am 29.03.2026: Tag hat nur 23 Stunden', () => {
    const g = berlinTagesGrenzen('2026-03-29', '2026-03-29');
    expect(g).toEqual({ ab: '2026-03-28T23:00:00.000Z', bis: '2026-03-29T21:59:59.999Z' });
    expect(new Date(g.bis).getTime() + 1 - new Date(g.ab).getTime()).toBe(23 * 3_600_000);
  });

  it('Umstellung auf Winterzeit am 25.10.2026: Tag hat 25 Stunden', () => {
    const g = berlinTagesGrenzen('2026-10-25', '2026-10-25');
    expect(g).toEqual({ ab: '2026-10-24T22:00:00.000Z', bis: '2026-10-25T22:59:59.999Z' });
    expect(new Date(g.bis).getTime() + 1 - new Date(g.ab).getTime()).toBe(25 * 3_600_000);
  });

  it('Zeitraum über beide Umstellungen hinweg', () => {
    expect(berlinTagesGrenzen('2026-03-28', '2026-10-26')).toEqual({
      ab: '2026-03-27T23:00:00.000Z',
      bis: '2026-10-26T22:59:59.999Z',
    });
  });

  it('Jahreswechsel', () => {
    expect(berlinTagesGrenzen('2026-12-31', '2027-01-01')).toEqual({
      ab: '2026-12-30T23:00:00.000Z',
      bis: '2027-01-01T22:59:59.999Z',
    });
  });

  it('wirft bei ungültigem Tag', () => {
    expect(() => berlinTagesGrenzen('2026-02-30', '2026-03-01')).toThrow();
  });
});

describe('Kalendertage', () => {
  it('istGueltigerTag', () => {
    expect(istGueltigerTag('2028-02-29')).toBe(true);
    expect(istGueltigerTag('2026-02-29')).toBe(false);
    expect(istGueltigerTag('2026-13-01')).toBe(false);
    expect(istGueltigerTag('26-01-01')).toBe(false);
  });

  it('tagPlus über Monats- und DST-Grenzen', () => {
    expect(tagPlus('2026-03-29', 1)).toBe('2026-03-30');
    expect(tagPlus('2026-10-25', -1)).toBe('2026-10-24');
    expect(tagPlus('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('tageInklusive', () => {
    expect(tageInklusive('2026-10-01', '2026-10-01')).toBe(1);
    expect(tageInklusive('2026-10-01', '2026-10-31')).toBe(31);
    expect(tageInklusive('2026-10-02', '2026-10-01')).toBe(0);
  });

  it('vorperiode: gleich viele Tage direkt davor', () => {
    expect(vorperiode('2026-10-01', '2026-10-31')).toEqual({ from: '2026-08-31', to: '2026-09-30' });
    expect(vorperiode('2026-10-09', '2026-10-15')).toEqual({ from: '2026-10-02', to: '2026-10-08' });
  });

  it('vorperiode über die Zeitumstellung: Berliner Grenzen bleiben auf Mitternacht', () => {
    const v = vorperiode('2026-10-26', '2026-11-01');
    expect(v).toEqual({ from: '2026-10-19', to: '2026-10-25' });
    expect(berlinTagesGrenzen(v.from, v.to)).toEqual({
      ab: '2026-10-18T22:00:00.000Z',
      bis: '2026-10-25T22:59:59.999Z',
    });
  });

  it('berlinTagVon: kurz nach Mitternacht Berlin zählt zum neuen Tag', () => {
    expect(berlinTagVon('2026-10-08T22:30:00Z')).toBe('2026-10-09');
    expect(berlinTagVon('2026-10-25T22:30:00Z')).toBe('2026-10-25');
  });
});
