import { describe, it, expect } from 'vitest';
import { computeSatisfaction, scoreOf } from '../analytics';

const row = (agency_id: string, rating: number | null, answers: Record<string, unknown>, created_at: string) => ({ agency_id, rating, answers, created_at, template_id: 't' });

describe('Zufriedenheit', () => {
  it('nimmt rating, sonst den Schnitt der Einzelfragen', () => {
    expect(scoreOf(row('a', 4, { x: 1 }, '2026-10-01'))).toBe(4);
    expect(scoreOf(row('a', null, { x: 2, y: 4, text: 'gut' }, '2026-10-01'))).toBe(3);
    expect(scoreOf(row('a', null, {}, '2026-10-01'))).toBeNull();
  });

  it('bildet Durchschnitte gesamt, je Kunde, je Betreuer, je Frage und im Verlauf', () => {
    const agencies = new Map([
      ['a', { name: 'B&C', csm_user_id: 'u1' }],
      ['b', { name: 'Halcyon', csm_user_id: 'u1' }],
      ['c', { name: 'Krüger', csm_user_id: null }],
    ]);
    const users = new Map([['u1', 'Nils']]);
    const labels = new Map([['kommunikation', 'Kommunikation']]);
    const s = computeSatisfaction(
      [
        row('a', 5, { kommunikation: 5 }, '2026-10-02T10:00:00Z'),
        row('a', 3, { kommunikation: 3 }, '2026-09-10T10:00:00Z'),
        row('b', 2, { kommunikation: 1 }, '2026-10-03T10:00:00Z'),
        row('c', 4, {}, '2026-08-01T10:00:00Z'),
      ],
      agencies,
      users,
      labels,
      new Date('2026-10-06T00:00:00Z'),
    );
    expect(s.gesamt).toEqual({ schnitt: 3.5, anzahl: 4 });
    expect(s.jeKunde.map((k) => [k.name, k.schnitt, k.anzahl])).toEqual([['Halcyon', 2, 1], ['B&C', 4, 2], ['Krüger', 4, 1]]);
    expect(s.jeBetreuer.find((b) => b.name === 'Nils')).toMatchObject({ schnitt: 3.3, anzahl: 3, kunden: 2 });
    expect(s.jeBetreuer.find((b) => b.name === 'Ohne Betreuer')).toMatchObject({ schnitt: 4 });
    expect(s.jeFrage).toEqual([{ id: 'kommunikation', label: 'Kommunikation', schnitt: 3, anzahl: 3 }]);
    expect(s.verlauf.at(-1)).toEqual({ monat: '2026-10', schnitt: 3.5, anzahl: 2 });
    expect(s.kritisch.map((k) => k.name)).toEqual(['Halcyon']);
  });

  it('kommt ohne Antworten aus', () => {
    const s = computeSatisfaction([], new Map(), new Map(), new Map());
    expect(s.gesamt).toEqual({ schnitt: null, anzahl: 0 });
    expect(s.verlauf).toHaveLength(6);
  });
});
