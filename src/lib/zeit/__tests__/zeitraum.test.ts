import { describe, expect, it } from 'vitest';
import { istMonatsPreset, pruefeZeitraum, zeitraumAufloesen } from '../zeitraum';

const HEUTE = '2026-10-15';

describe('zeitraumAufloesen', () => {
  it('7/30/90 Tage: letzte N Kalendertage inklusive heute', () => {
    expect(zeitraumAufloesen('7', HEUTE)).toEqual({ ok: true, from: '2026-10-09', to: HEUTE });
    expect(zeitraumAufloesen('30', HEUTE)).toEqual({ ok: true, from: '2026-09-16', to: HEUTE });
    expect(zeitraumAufloesen('90', HEUTE)).toEqual({ ok: true, from: '2026-07-18', to: HEUTE });
  });

  it('Dieser Monat: vom Ersten bis heute', () => {
    expect(zeitraumAufloesen('monat', HEUTE)).toEqual({ ok: true, from: '2026-10-01', to: HEUTE });
    expect(zeitraumAufloesen('monat', '2026-10-01')).toEqual({ ok: true, from: '2026-10-01', to: '2026-10-01' });
  });

  it('Letzter Monat: kompletter Vormonat, auch über den Jahreswechsel und im Februar', () => {
    expect(zeitraumAufloesen('vormonat', HEUTE)).toEqual({ ok: true, from: '2026-09-01', to: '2026-09-30' });
    expect(zeitraumAufloesen('vormonat', '2027-01-10')).toEqual({ ok: true, from: '2026-12-01', to: '2026-12-31' });
    expect(zeitraumAufloesen('vormonat', '2028-03-31')).toEqual({ ok: true, from: '2028-02-01', to: '2028-02-29' });
  });

  it('Eigener Zeitraum: gültig', () => {
    expect(zeitraumAufloesen('eigen', HEUTE, { von: '2026-03-29', bis: '2026-10-15' })).toEqual({
      ok: true,
      from: '2026-03-29',
      to: '2026-10-15',
    });
  });

  it('Eigener Zeitraum: Fehlerfälle', () => {
    expect(zeitraumAufloesen('eigen', HEUTE).ok).toBe(false);
    expect(zeitraumAufloesen('eigen', HEUTE, { von: '2026-10-10', bis: '2026-10-09' })).toEqual({
      ok: false,
      fehler: '„Bis" darf nicht vor „von" liegen.',
    });
    expect(zeitraumAufloesen('eigen', HEUTE, { von: '2026-10-10', bis: '2026-10-16' })).toEqual({
      ok: false,
      fehler: '„Bis" darf nicht in der Zukunft liegen.',
    });
    expect(zeitraumAufloesen('eigen', HEUTE, { von: '2025-10-14', bis: '2026-10-15' }).ok).toBe(false);
  });
});

describe('pruefeZeitraum', () => {
  it('366 Tage sind erlaubt, 367 nicht', () => {
    expect(pruefeZeitraum('2025-10-15', '2026-10-15')).toBeNull(); // 366 Tage
    expect(pruefeZeitraum('2025-10-14', '2026-10-15')).toMatch(/höchstens 366/);
  });

  it('ohne heute keine Zukunftsprüfung', () => {
    expect(pruefeZeitraum('2030-01-01', '2030-01-31')).toBeNull();
  });

  it('ungültige Tage', () => {
    expect(pruefeZeitraum('2026-02-30', '2026-03-01')).not.toBeNull();
  });
});

describe('istMonatsPreset', () => {
  it('nur Dieser/Letzter Monat', () => {
    expect(istMonatsPreset('monat')).toBe(true);
    expect(istMonatsPreset('vormonat')).toBe(true);
    expect(istMonatsPreset('30')).toBe(false);
    expect(istMonatsPreset('eigen')).toBe(false);
  });
});
