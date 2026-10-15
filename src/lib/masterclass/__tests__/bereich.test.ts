import { describe, expect, it } from 'vitest';
import { bereichVon } from '../bereich';

describe('bereichVon', () => {
  it('nur „fuehrung“ ist die Führungskräfte-Masterclass, alles andere die CEO-Masterclass', () => {
    expect(bereichVon({ bereich: 'fuehrung' })).toBe('fuehrung');
    expect(bereichVon({ bereich: 'ceo' })).toBe('ceo');
    expect(bereichVon({})).toBe('ceo');
    expect(bereichVon(null)).toBe('ceo');
  });
});
