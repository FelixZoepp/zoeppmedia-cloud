import { describe, expect, it } from 'vitest';
import { bewerte, kpiListe } from '../kpis';

describe('KPI-Übersicht', () => {
  it('bewertet gut/knapp/schlecht/offen', () => {
    const basis = { bereich: 'Sales' as const, name: 'x', ziel: 0.6, hoeherBesser: true, format: 'prozent' as const, tipp: '' };
    expect(bewerte({ ...basis, ist: 0.65 }).status).toBe('gut');
    expect(bewerte({ ...basis, ist: 0.55 }).status).toBe('knapp');
    expect(bewerte({ ...basis, ist: 0.3 }).status).toBe('schlecht');
    expect(bewerte({ ...basis, ist: null }).status).toBe('offen');
    expect(bewerte({ ...basis, hoeherBesser: false, ziel: 30, ist: 20 }).status).toBe('gut');
  });

  it('liefert alle Bereiche mit Oktober-Werten', () => {
    const l = kpiListe({
      kostenProLead: 126,
      showSetting: 0.78,
      settingZuClosing: 0.86,
      showClosing: 0.81,
      closingQuote: 0.56,
      upsellQuote: 0.77,
      tageBisUpsell: 35,
      startquote: 0.75,
      tageBisErstesGeld: 12,
      churn: 0.052,
      rueckgewinnungen: 3,
      marge: 0.41,
      werbeanteil: 0.26,
      tageBisZahlung: 9,
      puenktlich: 0.7,
      ueberfaelligBrutto: 20000,
      offeneRechnungenFehlen: 4,
      kundenProKopf: 30,
      zielKundenProKopf: 90,
    });
    expect(new Set(l.map((x) => x.bereich)).size).toBe(4);
    const s = Object.fromEntries(l.map((x) => [x.name, x.status]));
    expect(s['Kosten pro Lead']).toBe('knapp');
    expect(s['Upsell-Quote (Direktvertrieb)']).toBe('gut');
    expect(s['Churn pro Monat (Direktvertrieb)']).toBe('schlecht');
  });
});
