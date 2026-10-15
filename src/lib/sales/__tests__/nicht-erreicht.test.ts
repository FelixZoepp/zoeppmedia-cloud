import { describe, expect, it } from 'vitest';
import { onboardingZiel } from '../eintrag-kette';
import { baueRueckrufAufgabe } from '../noshow-antwort';

describe('onboardingZiel', () => {
  it('liest die Funnel-Antwort aus der Notiz (mit Zeilenumbrüchen)', () => {
    const n = 'Eintragung über Funnel „Vertriebspartner KI Agent“\nWie viele Vertriebler hast du aktuell?: 31 bis 200 Vertriebler\nWie viele Vertriebler möchtest du pro Monat onboarden?: 3 bis 5 Vertriebler\nWas ist aktuell dein größtes Problem?: Vertriebler performen nicht';
    expect(onboardingZiel(n)).toBe('3 bis 5 Vertriebler');
  });
  it('auch einzeilig und ohne „Vertriebler“', () => {
    expect(onboardingZiel('… pro Monat onboarden?: 1 bis 2 Was ist aktuell dein größtes Problem?: x')).toBe('1 bis 2 Vertriebler');
  });
  it('ohne Angabe: null', () => {
    expect(onboardingZiel('Eintragung über Funnel ohne Fragen')).toBeNull();
  });
});

describe('Rückruf-Aufgabe nach „nicht erreicht“', () => {
  it('nennt den Anlass', () => {
    const a = baueRueckrufAufgabe({ name: 'David', phone: '+49151', text: 'morgen ab 17 Uhr', art: 'nicht_erreicht' }, { tag: '2026-10-16', uhrzeit: 'ab 17 Uhr', mitentscheider: null, kurz: '' }, '2026-10-15');
    expect(a.datum).toBe('2026-10-16');
    expect(a.text).toContain('Rückruf (vorher nicht erreicht): David – Erstgespräch legen');
  });
});
