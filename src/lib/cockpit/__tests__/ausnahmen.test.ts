import { describe, it, expect } from 'vitest';
import { baueAusnahmen } from '../laden';

const leer = {
  roteKunden: [], ueberfaelligNachOwner: [], langImAufbau: [], kundenAufgabenUeberfaellig: 0, anfragenAlt: 0,
  upsellOffen: 0, mrrFehlt: 0, ohneLogin: 0, jobFehler: 0, kiUebersteuert: 0,
};

describe('Cockpit-Ausnahmen', () => {
  it('nichts los → keine Ausnahmen', () => {
    expect(baueAusnahmen(leer)).toEqual([]);
  });

  it('Rot vor Gelb, mit Link zum Kunden', () => {
    const a = baueAusnahmen({
      ...leer,
      mrrFehlt: 12,
      roteKunden: [{ id: 'k1', name: 'CGMS', hinweise: ['Kampagne läuft, aber 7 Tage keine neuen Bewerber'] }],
      ueberfaelligNachOwner: [{ name: 'Nils', anzahl: 3, maxTage: 9 }, { name: 'Petra', anzahl: 1, maxTage: 2 }],
    });
    expect(a.map((x) => x.stufe)).toEqual(['rot', 'rot', 'gelb', 'gelb']);
    expect(a[0]).toMatchObject({ bereich: 'Kunden', text: 'CGMS: Kampagne läuft, aber 7 Tage keine neuen Bewerber', link: '/clients/k1' });
    expect(a[1].text).toBe('Nils: 3 Schritte überfällig (ältester 9 Tage)');
    expect(a.find((x) => x.bereich === 'Finanzen')?.text).toContain('12 Kunden');
  });

  it('lange im Aufbau: ab 30 Tagen rot', () => {
    const a = baueAusnahmen({ ...leer, langImAufbau: [{ id: 'k', name: 'Orkanor', phase: 'Onboarding', tage: 35 }, { id: 'k2', name: 'Özdemir', phase: 'Setup', tage: 16 }] });
    expect(a.map((x) => [x.stufe, x.text])).toEqual([
      ['rot', 'Orkanor seit 35 Tagen in Onboarding – Kampagne noch nicht live'],
      ['gelb', 'Özdemir seit 16 Tagen in Setup – Kampagne noch nicht live'],
    ]);
  });

  it('Aufbau mit Zuständigkeit und Eskalation nach Erinnerungen', () => {
    const a = baueAusnahmen({
      ...leer,
      langImAufbau: [{ id: 'k', name: 'Rönnefahrt', phase: 'Onboarding', tage: 16, wartet: 'kunde' }],
      kundenNachErinnerung: [{ id: 'k', name: 'Rönnefahrt', offen: 4 }],
    });
    expect(a.map((x) => x.text)).toEqual([
      'Rönnefahrt: 4 Aufgaben trotz 3 Erinnerungen offen – kurz anrufen',
      'Rönnefahrt seit 16 Tagen in Onboarding – Kampagne noch nicht live (wartet auf den Kunden)',
    ]);
  });
});
