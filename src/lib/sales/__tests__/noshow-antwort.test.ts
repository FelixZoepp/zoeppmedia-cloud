import { describe, it, expect } from 'vitest';
import { baueRueckrufAufgabe } from '../noshow-antwort';

const p = { name: 'Max Muster', phone: '+491511234567', text: 'Morgen ab 17 Uhr passt', art: 'setting' as const };

describe('baueRueckrufAufgabe', () => {
  it('Wunschtag wird Fälligkeit, Uhrzeit und Antwort stehen im Text', () => {
    const a = baueRueckrufAufgabe(p, { tag: '2026-10-14', uhrzeit: 'ab 17 Uhr', mitentscheider: null, kurz: 'Morgen ab 17 Uhr' }, '2026-10-13');
    expect(a.datum).toBe('2026-10-14');
    expect(a.text).toContain('Erstgespräch nachholen');
    expect(a.text).toContain('14.10.');
    expect(a.text).toContain('ab 17 Uhr');
    expect(a.text).toContain('„Morgen ab 17 Uhr passt“');
  });

  it('ohne Angabe oder mit Tag in der Vergangenheit → heute', () => {
    expect(baueRueckrufAufgabe(p, null, '2026-10-13').datum).toBe('2026-10-13');
    expect(baueRueckrufAufgabe(p, null, '2026-10-13').text).toContain('heute anrufen');
    expect(baueRueckrufAufgabe(p, { tag: '2026-10-01', uhrzeit: null, mitentscheider: null, kurz: '' }, '2026-10-13').datum).toBe('2026-10-13');
  });

  it('Closing: alle Entscheider und genannte Mitentscheider', () => {
    const a = baueRueckrufAufgabe({ ...p, art: 'closing' }, { tag: null, uhrzeit: '10:00', mitentscheider: 'Partner Tom', kurz: '' }, '2026-10-13');
    expect(a.text).toContain('alle Entscheider');
    expect(a.text).toContain('Mitentscheider: Partner Tom');
  });
});
