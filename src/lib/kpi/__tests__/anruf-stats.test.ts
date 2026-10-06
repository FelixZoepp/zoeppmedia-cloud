import { describe, it, expect } from 'vitest';
import { berechneAnrufStats, dauerText } from '../anruf-stats';

describe('berechneAnrufStats', () => {
  const r = berechneAnrufStats(
    [
      { user_id: 'u1', result: 'termin_vereinbart' },
      { user_id: 'u1', result: 'nicht_erreicht' },
      { user_id: 'u1', result: 'nicht_erreicht' },
      { user_id: 'u2', result: 'kein_interesse' },
      { user_id: 'u2', result: 'rueckruf' },
      { user_id: null, result: 'falsche_nummer' },
    ],
    new Map([['u1', 'Lea Hoff'], ['u2', 'Tom Lenz']]),
    [120, 600, null, 3600],
    [
      { status: 'erschienen', scheduled_at: '2026-10-01T10:00:00Z' },
      { status: 'no_show', scheduled_at: '2026-10-02T10:00:00Z' },
      { status: 'geplant', scheduled_at: '2026-10-03T10:00:00Z' },
      { status: 'abgesagt', scheduled_at: '2026-10-03T12:00:00Z' },
      { status: 'geplant', scheduled_at: '2026-10-20T10:00:00Z' },
    ],
    new Date('2026-10-06T12:00:00Z'),
  );

  it('Erreichbarkeit = erreicht ÷ alle Anrufe', () => {
    expect(r).toMatchObject({ gesamt: 6, erreicht: 3, termine: 1 });
    expect(r.erreichbarkeit).toBeCloseTo(0.5);
    expect(r.proErgebnis[0]).toMatchObject({ ergebnis: 'nicht_erreicht', anzahl: 2, label: 'Nicht erreicht' });
  });

  it('Anrufe je Person mit Namen', () => {
    expect(r.proPerson[0]).toMatchObject({ name: 'Lea Hoff', gesamt: 3, erreicht: 1, termine: 1 });
    expect(r.proPerson.find((p) => p.user_id === null)?.name).toBe('Unbekannt');
  });

  it('Speed-to-Lead und No-Show-Quote', () => {
    expect(r.speedToLeadSek).toBe(1440);
    expect(r.speedToLeadAnzahl).toBe(3);
    expect(r).toMatchObject({ termineVergangen: 3, noShows: 1 });
    expect(r.noShowQuote).toBeCloseTo(0.5);
  });

  it('ohne Daten', () => {
    const leer = berechneAnrufStats([], new Map(), [], [], new Date());
    expect(leer).toMatchObject({ gesamt: 0, erreichbarkeit: null, speedToLeadSek: null, noShowQuote: null });
  });
});

describe('dauerText', () => {
  it('formatiert Sekunden lesbar', () => {
    expect(dauerText(240)).toBe('4 Min.');
    expect(dauerText(9000)).toBe('2,5 Std.');
    expect(dauerText(129600)).toBe('1,5 Tage');
    expect(dauerText(null)).toBe('–');
  });
});
