import { describe, expect, it } from 'vitest';
import { upsell, zufriedenheit } from '../kunden-sync';

describe('Kunden-Abgleich', () => {
  it('Zufriedenheit = Schnitt der letzten 2 Umfragen (rating oder Einzelfragen)', () => {
    expect(zufriedenheit([{ rating: 9, answers: null }, { rating: null, answers: { a: 8, b: 6 } }, { rating: 2, answers: null }])).toBe(8);
    expect(zufriedenheit([])).toBeNull();
  });
  it('Upsell nur bei Zufriedenheit ≥ 8, guten Ergebnissen und passender Leistung', () => {
    expect(upsell(9, { einstellungen30: 2, bewerber30: 30 }, ['Arbeitgebermarke stärken']).ja).toBe(true);
    expect(upsell(7.5, { einstellungen30: 2, bewerber30: 30 }, ['X']).ja).toBe(false);
    expect(upsell(9, { einstellungen30: 0, bewerber30: 4 }, ['X']).ja).toBe(false);
    expect(upsell(9, { einstellungen30: 1, bewerber30: 4 }, []).ja).toBe(false);
    expect(upsell(null, { einstellungen30: 3, bewerber30: 40 }, ['X'])).toEqual({ ja: false, grund: 'keine Zufriedenheitsumfrage' });
  });
});
