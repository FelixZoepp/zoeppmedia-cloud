import { describe, expect, it } from 'vitest';
import { berechneStellenKosten, berlinTagesbeginn, quelleVon, summeJeKunde, zeitraum } from '../stellen';

describe('berechneStellenKosten', () => {
  const basis = {
    von: '2026-10-01',
    bis: '2026-10-10',
    stellen: [
      { id: 'j1', title: 'Vertrieb' },
      { id: 'j2', title: 'Lager' },
    ],
    zuordnungen: [{ campaign_id: 'c1', job_id: 'j1' }],
    metaTage: [
      { campaign_id: 'c1', datum: '2026-10-02', spend: '100' },
      { campaign_id: 'c1', datum: '2026-10-03', spend: 50 },
      { campaign_id: 'c1', datum: '2026-09-30', spend: 999 }, // außerhalb
      { campaign_id: 'c2', datum: '2026-10-04', spend: 30 }, // ohne Stelle → nur Gesamt
    ],
    indeedPhasen: [
      { tagesbudget: 10, start: '2026-10-01', ende: null, job_id: 'j2' }, // 10 Tage = 100
      { tagesbudget: 5, start: '2026-10-09', ende: null, job_id: null }, // 2 Tage = 10, ganzer Kunde
    ],
    bewerber: [
      { source: 'meta', job_id: 'j1' },
      { source: 'meta', job_id: 'j1' },
      { source: 'meta', job_id: 'j1' },
      { source: 'indeed', job_id: 'j2' },
      { source: 'indeed', job_id: 'j2' },
      { source: 'manual', job_id: null },
    ],
    termine: [{ job_id: 'j1' }, { job_id: 'j2' }, { job_id: null }],
    einstellungen: [{ job_id: 'j1' }],
  };

  it('verteilt Meta über die Kampagnen-Zuordnung und Indeed über die Stelle der Phase', () => {
    const r = berechneStellenKosten(basis);
    const [j1, j2] = r.stellen;
    expect(j1).toMatchObject({ metaKosten: 150, indeedKosten: 0, kosten: 150, bewerber: 3, kostenProBewerber: 50, metaKostenProBewerber: 50, kostenProTermin: 150, kostenProEinstellung: 150, kampagnen: 1 });
    expect(j2).toMatchObject({ metaKosten: 0, indeedKosten: 100, bewerber: 2, indeedKostenProBewerber: 50, termine: 1, kostenProEinstellung: null });
    expect(r.gesamt).toMatchObject({ metaKosten: 180, indeedKosten: 110, kosten: 290, bewerber: 6, termine: 3, einstellungen: 1, kampagnen: 2 });
    expect(r.gesamt.bewerberQuelle).toEqual({ meta: 3, indeed: 2, sonstige: 1 });
    expect(r.gesamt.kostenProBewerber).toBe(48.33);
    expect(r.ohneStelle).toEqual({ meta: 30, indeed: 10 });
  });

  it('ohne Kosten oder ohne Ergebnisse: keine Kennzahl statt 0 bzw. Unendlich', () => {
    const r = berechneStellenKosten({ ...basis, metaTage: [], indeedPhasen: [], einstellungen: [] });
    expect(r.gesamt.kostenProBewerber).toBeNull();
    expect(r.gesamt.kostenProEinstellung).toBeNull();
  });
});

describe('Hilfen', () => {
  it('Quellen', () => {
    expect(quelleVon('meta')).toBe('meta');
    expect(quelleVon('Indeed')).toBe('indeed');
    expect(quelleVon(null)).toBe('sonstige');
  });

  it('Berliner Tagesbeginn (Sommer- und Winterzeit)', () => {
    expect(berlinTagesbeginn('2026-07-01')).toBe('2026-06-30T22:00:00.000Z');
    expect(berlinTagesbeginn('2026-12-01')).toBe('2026-11-30T23:00:00.000Z');
  });

  it('Zeitraum inklusive heute', () => {
    expect(zeitraum(30, new Date('2026-10-16T10:00:00Z'))).toEqual({ von: '2026-09-17', bis: '2026-10-16' });
  });

  it('Summe je Kunde', () => {
    expect(summeJeKunde([{ agency_id: 'a', spend: '10.10' }, { agency_id: 'a', spend: 5.2 }, { agency_id: 'b', spend: null }])).toEqual(new Map([['a', 15.3], ['b', 0]]));
  });
});
