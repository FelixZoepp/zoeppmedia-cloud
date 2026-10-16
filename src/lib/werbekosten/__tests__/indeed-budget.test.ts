import { describe, expect, it } from 'vitest';
import { ersterStart, gleicheSpur, indeedKosten, laufendePhase, leadpreis, tageImZeitraum, tagesbudgetHeute } from '../indeed-budget';

describe('Indeed-Budget', () => {
  it('zählt Tage inklusive Start und Ende', () => {
    expect(tageImZeitraum({ start: '2026-10-01', ende: null }, '2026-10-01', '2026-10-14')).toBe(14);
    expect(tageImZeitraum({ start: '2026-10-10', ende: '2026-10-12' }, '2026-10-01', '2026-10-14')).toBe(3);
    expect(tageImZeitraum({ start: '2026-10-20', ende: null }, '2026-10-01', '2026-10-14')).toBe(0);
    expect(tageImZeitraum({ start: '2026-09-01', ende: '2026-09-23' }, '2026-10-01', '2026-10-14')).toBe(0);
  });

  it('rechnet Phasen mit Budgetwechsel und Pause', () => {
    const phasen = [
      { tagesbudget: 20, start: '2026-09-01', ende: '2026-09-10' }, // 10 Tage
      { tagesbudget: 30, start: '2026-09-11', ende: '2026-09-23' }, // 13 Tage, dann Pause
    ];
    expect(indeedKosten(phasen, '2026-09-01', '2026-10-14')).toEqual({ kosten: 200 + 390, tage: 23 });
    expect(indeedKosten(phasen, '2026-09-05', '2026-09-12')).toEqual({ kosten: 6 * 20 + 2 * 30, tage: 8 });
  });

  it('Leadpreis nur mit Bewerbern und Kosten', () => {
    expect(leadpreis(590, 20)).toBe(29.5);
    expect(leadpreis(590, 0)).toBeNull();
    expect(leadpreis(0, 5)).toBeNull();
  });

  it('erkennt laufende Phase und ersten Start', () => {
    const phasen = [{ tagesbudget: 20, start: '2026-10-01', ende: null }, { tagesbudget: 10, start: '2026-08-01', ende: '2026-08-31' }];
    expect(laufendePhase(phasen, '2026-10-14')?.tagesbudget).toBe(20);
    expect(laufendePhase(phasen, '2026-09-15')).toBeNull();
    expect(ersterStart(phasen)).toBe('2026-08-01');
  });

  it('Budget je Stelle: laufende Budgets summiert, Spuren getrennt', () => {
    const phasen = [
      { tagesbudget: 20, start: '2026-10-01', ende: null, job_id: null },
      { tagesbudget: 15, start: '2026-10-05', ende: null, job_id: 'j1' },
      { tagesbudget: 50, start: '2026-09-01', ende: '2026-09-30', job_id: 'j1' },
    ];
    expect(tagesbudgetHeute(phasen, '2026-10-14')).toBe(35);
    expect(tagesbudgetHeute(phasen, '2026-08-01')).toBeNull();
    expect(gleicheSpur(phasen[0], null)).toBe(true);
    expect(gleicheSpur(phasen[1], 'j1')).toBe(true);
    expect(gleicheSpur(phasen[1], null)).toBe(false);
    expect(gleicheSpur({}, null)).toBe(true);
  });
});
