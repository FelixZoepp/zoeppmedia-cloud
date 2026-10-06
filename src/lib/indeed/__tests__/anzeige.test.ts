import { describe, it, expect } from 'vitest';
import { baueBriefing, fehlendeAngaben, briefingText, anzeigeAlsText } from '../anzeige';

describe('Indeed-Anzeige: Briefing', () => {
  it('nimmt das Onboarding-Formular, fällt aufs Kundenprofil zurück', () => {
    const b = baueBriefing(
      'Turhan Vertriebs GmbH',
      { job_title: null, regions: ['Köln', 'Bonn'], product: 'Glasfaser', monthly_earning_from: '3000', monthly_earning_to: 6000, employment_type: 'Vollzeit', tone: 'du' },
      { gesuchte_rolle: 'Vertriebsmitarbeiter im Außendienst', alleinstellung: 'Feste Gebiete' },
    );
    expect(b).toMatchObject({
      firma: 'Turhan Vertriebs GmbH',
      jobtitel: 'Vertriebsmitarbeiter im Außendienst',
      regionen: ['Köln', 'Bonn'],
      verdienst_von: 3000,
      verdienst_bis: 6000,
      alleinstellung: 'Feste Gebiete',
      ansprache: 'du',
    });
    expect(fehlendeAngaben(b)).toEqual([]);
  });

  it('meldet fehlende Pflichtangaben', () => {
    const b = baueBriefing('Kunde', null, null);
    expect(fehlendeAngaben(b)).toEqual([
      'Stellenbezeichnung',
      'Arbeitsort / Region',
      'Produkt bzw. was verkauft wird',
      'Vergütung (Fix, Provision oder Verdienstspanne)',
      'Anstellungsart',
    ]);
  });

  it('Briefing-Text enthält nur gefüllte Felder und die Gesprächsinfos', () => {
    const b = baueBriefing('Kunde', { job_title: 'Closer (m/w/d)', experience_needed: false }, null);
    const t = briefingText(b, 'Firmenwagen ab Teamleiter');
    expect(t).toContain('Stelle: Closer (m/w/d)');
    expect(t).toContain('Erfahrung nötig: nein');
    expect(t).not.toContain('Produkt:');
    expect(t).toContain('Zusätzliche Infos aus dem Gespräch:\nFirmenwagen ab Teamleiter');
  });

  it('lesbare Fassung mit Gehaltsspanne', () => {
    const t = anzeigeAlsText({
      titel: 'Vertriebsmitarbeiter (m/w/d)',
      arbeitsort: 'Köln',
      anstellungsart: 'Vollzeit',
      gehalt_von: 3000,
      gehalt_bis: 6000,
      gehalt_zeitraum: 'Monat',
      text: 'Deine Aufgaben\n• Beraten',
      offene_punkte: [],
    });
    expect(t).toBe('Arbeitsort: Köln\nAnstellungsart: Vollzeit\nGehalt: 3.000 € – 6.000 € pro Monat\n\nDeine Aufgaben\n• Beraten');
  });
});
