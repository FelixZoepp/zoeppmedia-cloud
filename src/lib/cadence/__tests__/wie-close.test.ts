import { describe, expect, it } from 'vitest';
import { morgenAchtUhr, planeNaechstenVersuch } from '../engine';

describe('morgenAchtUhr (Anruf-Modus wie Close)', () => {
  it('Sommerzeit: nachmittags nicht erreicht → morgen 08:00 Berlin', () => {
    // 15.10.2026 14:00 Berlin (MESZ)
    expect(morgenAchtUhr(new Date('2026-10-15T12:00:00Z')).toISOString()).toBe('2026-10-16T06:00:00.000Z');
  });

  it('abends nach 20 Uhr ebenfalls morgen 08:00, nicht 09:00', () => {
    expect(morgenAchtUhr(new Date('2026-10-15T19:30:00Z')).toISOString()).toBe('2026-10-16T06:00:00.000Z');
  });

  it('Umstellung auf Winterzeit (25.10.2026): 08:00 MEZ', () => {
    expect(morgenAchtUhr(new Date('2026-10-24T10:00:00Z')).toISOString()).toBe('2026-10-25T07:00:00.000Z');
  });

  it('Winterzeit und Monatswechsel', () => {
    expect(morgenAchtUhr(new Date('2026-11-30T15:00:00Z')).toISOString()).toBe('2026-12-01T07:00:00.000Z');
  });

  it('Berliner Kalendertag zählt (00:30 Berlin = schon der nächste Tag)', () => {
    expect(morgenAchtUhr(new Date('2026-10-15T22:30:00Z')).toISOString()).toBe('2026-10-17T06:00:00.000Z');
  });
});

describe('planeNaechstenVersuch', () => {
  const jetzt = new Date('2026-10-15T08:00:00Z'); // 10:00 Berlin

  it('ohne Freigabe wie bisher: Versuch 1→2 nach 3 Stunden am selben Tag, anderes Fenster', () => {
    const plan = planeNaechstenVersuch({ bisherigeVersuche: 0, fenster: 'morning', jetzt });
    expect(plan).toEqual({ stopp: false, currentAttempt: 1, nextAt: new Date('2026-10-15T11:00:00Z'), nextWindow: 'afternoon' });
  });

  it('mit Freigabe: kein zweiter Versuch am selben Tag, sondern morgen 08:00', () => {
    const plan = planeNaechstenVersuch({ bisherigeVersuche: 0, fenster: 'morning', jetzt, wieClose: true });
    expect(plan).toEqual({ stopp: false, currentAttempt: 1, nextAt: new Date('2026-10-16T06:00:00Z'), nextWindow: 'morning' });
  });

  it('mit Freigabe zählt die Versuche weiter', () => {
    const plan = planeNaechstenVersuch({ bisherigeVersuche: 3, fenster: 'afternoon', jetzt, wieClose: true });
    expect(plan).toMatchObject({ stopp: false, currentAttempt: 4, nextAt: new Date('2026-10-16T06:00:00Z') });
  });

  it('nach dem 6. Versuch ist Schluss – mit und ohne Freigabe', () => {
    expect(planeNaechstenVersuch({ bisherigeVersuche: 5, fenster: 'morning', jetzt })).toEqual({ stopp: true });
    expect(planeNaechstenVersuch({ bisherigeVersuche: 5, fenster: 'morning', jetzt, wieClose: true })).toEqual({ stopp: true });
    expect(planeNaechstenVersuch({ bisherigeVersuche: 4, fenster: 'morning', jetzt, wieClose: true })).toMatchObject({ stopp: false, currentAttempt: 5 });
  });

  it('ohne Freigabe: +3 Stunden nach 20 Uhr landet am nächsten Morgen 09:00 (Ruhezeit)', () => {
    const abends = new Date('2026-10-15T16:30:00Z'); // 18:30 Berlin → 21:30
    const plan = planeNaechstenVersuch({ bisherigeVersuche: 0, fenster: 'evening', jetzt: abends });
    expect(plan).toMatchObject({ stopp: false, nextAt: new Date('2026-10-16T07:00:00Z'), nextWindow: 'morning' });
  });
});
