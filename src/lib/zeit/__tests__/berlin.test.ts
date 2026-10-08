import { describe, expect, it } from 'vitest';
import { berlinMonatsStart, berlinTag, berlinTagesStart, berlinWochenStart } from '../berlin';

describe('Berlin-Kalendergrenzen', () => {
  it('Sonntag gehört zur laufenden Woche (Montag davor)', () => {
    // Sonntag, 11.10.2026, 12:00 Berlin (MESZ)
    expect(berlinWochenStart(new Date('2026-10-11T10:00:00Z')).toISOString()).toBe('2026-10-04T22:00:00.000Z');
  });

  it('Montag 00:30 Berlin ist schon die neue Woche, obwohl UTC noch Sonntag ist', () => {
    expect(berlinWochenStart(new Date('2026-10-11T22:30:00Z')).toISOString()).toBe('2026-10-11T22:00:00.000Z');
  });

  it('Tageswechsel zwischen 0 und 2 Uhr nach Berliner Zeit', () => {
    const t = new Date('2026-10-08T23:30:00Z'); // 09.10. 01:30 Berlin
    expect(berlinTag(t)).toBe('2026-10-09');
    expect(berlinTagesStart(t).toISOString()).toBe('2026-10-08T22:00:00.000Z');
  });

  it('Winterzeit und Monatsanfang', () => {
    expect(berlinMonatsStart(new Date('2026-12-15T12:00:00Z')).toISOString()).toBe('2026-11-30T23:00:00.000Z');
    expect(berlinMonatsStart(new Date('2026-01-15T12:00:00Z'), -1).toISOString()).toBe('2025-11-30T23:00:00.000Z');
  });
});
