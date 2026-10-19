import { describe, expect, it } from 'vitest';
import { verschiebungsText } from '../verschiebung-close';

describe('verschiebungsText', () => {
  it('Erstgespräch: alter → neuer Termin in Berliner Zeit', () => {
    expect(verschiebungsText('2026-10-20T07:00:00Z', '2026-10-27T08:00:00Z', 'setting')).toBe(
      '🔁 Erstgespräch verschoben (Calendly): Di., 20.10., 09:00 Uhr → Di., 27.10., 09:00 Uhr',
    );
  });

  it('Beratungsgespräch', () => {
    expect(verschiebungsText('2026-10-21T15:00:00Z', '2026-10-22T15:00:00Z', 'beratung')).toMatch(/^🔁 Beratungsgespräch verschoben/);
  });
});
