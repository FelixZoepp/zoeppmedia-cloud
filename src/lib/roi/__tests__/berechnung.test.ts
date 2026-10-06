import { describe, it, expect } from 'vitest';
import { berechneRoi, monatPlus, monatVon } from '../berechnung';

const jetzt = new Date('2026-10-06T10:00:00Z');

describe('Monate', () => {
  it('rechnet Monatsanfänge', () => {
    expect(monatVon('2026-10-31T23:00:00Z')).toBe('2026-10-01');
    expect(monatPlus('2026-01-01', -1)).toBe('2025-12-01');
  });
});

describe('berechneRoi', () => {
  const einstellungen = [
    { id: 'a', name: 'Anna', eingestellt_am: '2026-07-10T00:00:00Z' },
    { id: 'b', name: 'Ben', eingestellt_am: '2026-08-02T00:00:00Z' },
    { id: 'c', name: 'Cem', eingestellt_am: '2026-09-20T00:00:00Z' },
    { id: 'd', name: 'Dora', eingestellt_am: '2026-10-01T00:00:00Z' },
  ];
  const eintraege = [
    { candidate_id: 'a', monat: '2026-08-01', umsatz: 4000, provision: 1200, aktiv: true },
    { candidate_id: 'b', monat: '2026-08-01', umsatz: 2000, provision: null, aktiv: true },
    { candidate_id: 'a', monat: '2026-09-01', umsatz: 6000, provision: 1800, aktiv: true },
    { candidate_id: 'b', monat: '2026-09-01', umsatz: 0, provision: null, aktiv: false },
  ];
  const r = berechneRoi({ einstellungen, eintraege, kosten: { mrr: 2380, werbebudget: 620, start: '2026-07-01' }, jetzt });

  it('Umsatz, Wachstum und ROI des letzten Monats', () => {
    expect(r.letzterMonat).toBe('2026-09-01');
    expect(r.umsatzLetzterMonat).toBe(6000);
    expect(r.umsatzVormonat).toBe(6000);
    expect(r.wachstumProzent).toBe(0);
    expect(r.roiLetzterMonat).toBe(2);
    expect(r.aktiveVertriebler).toBe(1);
  });

  it('kumulierter ROI seit Start (Jul–Sep: 9.000 € Kosten, 12.000 € Umsatz)', () => {
    expect(r.kostenGesamt).toBe(9000);
    expect(r.umsatzGesamt).toBe(12000);
    expect(r.roiKumuliert).toBe(1.3);
  });

  it('Pflicht-Einträge: Cem fehlt für September, Ben ist raus, Dora erst im Oktober eingestellt', () => {
    expect(r.fehlend).toEqual([{ id: 'c', name: 'Cem' }]);
  });

  it('12 Monate Verlauf mit Kosten ab Start', () => {
    expect(r.monate).toHaveLength(12);
    expect(r.monate.at(-1)!.monat).toBe('2026-10-01');
    expect(r.monate.find((m) => m.monat === '2026-06-01')!.kosten).toBeNull();
    expect(r.monate.find((m) => m.monat === '2026-08-01')).toMatchObject({ umsatz: 6000, provision: 1200, roi: 2 });
  });

  it('ohne Kosten kein ROI', () => {
    const x = berechneRoi({ einstellungen, eintraege, kosten: { mrr: null, werbebudget: null, start: null }, jetzt });
    expect(x.roiLetzterMonat).toBeNull();
    expect(x.roiKumuliert).toBeNull();
  });
});
