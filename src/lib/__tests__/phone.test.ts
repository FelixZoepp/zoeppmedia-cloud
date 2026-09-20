import { describe, it, expect } from 'vitest';
import { normalizePhoneE164 } from '../phone';

describe('normalizePhoneE164', () => {
  it('normalisiert deutsche 0-Nummern', () => {
    expect(normalizePhoneE164('0176 1234567')).toBe('+491761234567');
  });
  it('behält +49 bei', () => {
    expect(normalizePhoneE164('+49 176 1234567')).toBe('+491761234567');
  });
  it('wandelt 0049 um', () => {
    expect(normalizePhoneE164('0049176/1234567')).toBe('+491761234567');
  });
  it('akzeptiert andere Länder mit +', () => {
    expect(normalizePhoneE164('+43 660 1234567')).toBe('+436601234567');
  });
  it('gibt null bei Müll zurück', () => {
    expect(normalizePhoneE164('abc')).toBeNull();
    expect(normalizePhoneE164('')).toBeNull();
    expect(normalizePhoneE164(null)).toBeNull();
    expect(normalizePhoneE164('123')).toBeNull(); // zu kurz
  });
});
