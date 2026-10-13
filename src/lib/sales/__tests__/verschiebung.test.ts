import { describe, it, expect } from 'vitest';
import { baueNeuLegenAufgabe, gespraechAusTermin } from '../verschiebung';

describe('gespraechAusTermin', () => {
  it('Beratungsgespräch → closing, Analysegespräch → setting', () => {
    expect(gespraechAusTermin('60min Beratungsgespräch mit Felix Zoepp')).toBe('closing');
    expect(gespraechAusTermin('Analysegespräch mit Zoepp Media')).toBe('setting');
    expect(gespraechAusTermin(null)).toBe('setting');
  });
});

describe('baueNeuLegenAufgabe', () => {
  const x = { name: 'Michael Kleta', phone: '+4915237897519', text: 'Bin krank, gerne nächste Woche', gespraech: 'closing' as const };
  it('ohne Wunschzeit: heute, Grund und Hinweis', () => {
    const a = baueNeuLegenAufgabe(x, { tag: null, uhrzeit: null, mitentscheider: null, grund: 'krank' }, '2026-10-13');
    expect(a.datum).toBe('2026-10-13');
    expect(a.text).toContain('Beratungsgespräch neu legen (alle Entscheider)');
    expect(a.text).toContain('Grund: krank');
    expect(a.text).toContain('heute melden');
    expect(a.text).toContain('Calendly');
  });
  it('mit Wunschtag: Fälligkeit am Wunschtag', () => {
    const a = baueNeuLegenAufgabe({ ...x, gespraech: 'setting' }, { tag: '2026-10-20', uhrzeit: '10:00', mitentscheider: null, grund: null }, '2026-10-13');
    expect(a.datum).toBe('2026-10-20');
    expect(a.text).toContain('Erstgespräch neu legen');
    expect(a.text).toContain('20.10.');
    expect(a.text).toContain('10:00');
  });
});
