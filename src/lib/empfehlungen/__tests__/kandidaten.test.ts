import { describe, expect, it } from 'vitest';
import { istKandidat } from '../kandidaten';

describe('Empfehlungs-Kandidat', () => {
  it('zufrieden + Ergebnisse', () => {
    expect(istKandidat(9, { einstellungen30: 1, bewerber30: 3 }, false).ja).toBe(true);
    expect(istKandidat(8, { einstellungen30: 0, bewerber30: 12 }, false).ja).toBe(true);
    expect(istKandidat(7, { einstellungen30: 3, bewerber30: 40 }, false).ja).toBe(false);
    expect(istKandidat(10, { einstellungen30: 0, bewerber30: 4 }, false).ja).toBe(false);
    expect(istKandidat(null, { einstellungen30: 2, bewerber30: 20 }, false).ja).toBe(false);
    expect(istKandidat(10, { einstellungen30: 2, bewerber30: 20 }, true).ja).toBe(false);
  });
});
