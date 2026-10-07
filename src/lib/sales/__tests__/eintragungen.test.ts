import { describe, it, expect } from 'vitest';
import { ergebnisFuer, eintragungsZahlen } from '../eintragungen';

const t = (min: number) => new Date(Date.parse('2026-10-07T10:00:00Z') + min * 60_000);

describe('Eintragung → Termin', () => {
  it('Ergebnis nach Buchungszeitpunkt', () => {
    expect(ergebnisFuer(t(0), t(4), t(20))).toBe('direkt_gebucht');
    expect(ergebnisFuer(t(0), t(45), t(60))).toBe('spaeter_gebucht');
    expect(ergebnisFuer(t(0), null, t(11))).toBe('nicht_gebucht');
    expect(ergebnisFuer(t(0), null, t(5))).toBe('offen');
  });

  it('Kennzahlen', () => {
    const z = eintragungsZahlen([
      { eingetragen_am: t(0).toISOString(), gebucht_am: t(3).toISOString(), ergebnis: 'direkt_gebucht' },
      { eingetragen_am: t(0).toISOString(), gebucht_am: t(90).toISOString(), ergebnis: 'spaeter_gebucht' },
      { eingetragen_am: t(0).toISOString(), gebucht_am: null, ergebnis: 'nicht_gebucht' },
      { eingetragen_am: t(0).toISOString(), gebucht_am: null, ergebnis: 'nicht_gebucht' },
    ]);
    expect(z).toMatchObject({ eintragungen: 4, direkt: 1, direktQuote: 25, nichtGebucht10: 3, nichtGebucht10Quote: 75, spaeter: 1, ohneTermin: 2 });
    expect(z.medianMinBisBuchung).toBe(90);
  });
});
