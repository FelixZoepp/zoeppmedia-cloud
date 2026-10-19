import { describe, it, expect } from 'vitest';
import { selbstbucherFrist } from '../selbstbucher';
import { regelnTerminierung, TERMINIERUNG_FELDER as T } from '../protokolle';

describe('Bucht sich selbst ein', () => {
  it('Frist: Kalender, sonst 2 Werktage 10 Uhr', () => {
    expect(selbstbucherFrist('2026-10-22T12:00:00Z', new Date('2026-10-19T10:00:00Z'))).toBe('2026-10-22T12:00:00.000Z');
    // Freitag → Dienstag
    expect(selbstbucherFrist(null, new Date('2026-10-23T10:00:00Z'))).toBe('2026-10-27T08:00:00.000Z');
    expect(selbstbucherFrist(null, new Date('2026-10-19T10:00:00Z'))).toBe('2026-10-21T08:00:00.000Z');
  });
  it('Terminierung: gesperrt bis Frist + Check', () => {
    const a = regelnTerminierung({ [T.wenErreicht]: 'Lead', [T.ergebnis]: 'Bucht sich selbst ein' }, new Date('2026-10-19T10:00:00Z'));
    expect(a).toEqual({ gesperrtBis: '2026-10-21T08:00:00.000Z', selbstbucher: '2026-10-21T08:00:00.000Z' });
  });
});
