import { describe, expect, it } from 'vitest';
import { brauchtProtokoll } from '../protokoll-pflicht';

describe('brauchtProtokoll', () => {
  it('nur Gespräche ab 60 Sekunden mit Lead', () => {
    expect(brauchtProtokoll({ lead_id: 'lead_1', duration: 75 })).toBe(true);
    expect(brauchtProtokoll({ lead_id: 'lead_1', duration: 30 })).toBe(false);
    expect(brauchtProtokoll({ lead_id: null, duration: 300 })).toBe(false);
  });
});
