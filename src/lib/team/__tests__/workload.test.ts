import { describe, it, expect } from 'vitest';
import { computeWorkload, KAPAZITAET } from '../workload';

const u = (id: string) => ({ id, name: id, email: `${id}@x.de`, position: null, funktion: null, role: 'employee', last_login: null });

describe('computeWorkload', () => {
  it('zählt offene Aufgaben je Quelle und gewichtet Überfälliges doppelt', () => {
    const [a] = computeWorkload(
      [u('a')],
      {
        schritte: [{ owner: 'a', faellig: '2026-10-01' }, { owner: 'b', faellig: null }],
        ads: [{ owner: 'a', faellig: null }],
        projekt: [],
        intern: [{ owner: 'a', faellig: '2026-10-09' }],
      },
      [],
      '2026-10-05',
      '2026-09-05',
    );
    expect(a.offen).toBe(3);
    expect(a.ueberfaellig).toBe(1);
    expect(a.quellen).toEqual({ schritte: 1, ads: 1, projekt: 0, intern: 1 });
    expect(a.workload).toBe(Math.round((4 / KAPAZITAET) * 100));
  });

  it('deckelt bei 100 % und zählt nur Erledigtes im Zeitraum', () => {
    const viele = Array.from({ length: 40 }, () => ({ owner: 'a', faellig: null }));
    const [a] = computeWorkload(
      [u('a')],
      { schritte: viele, ads: [], projekt: [], intern: [] },
      [{ owner: 'a', am: '2026-09-20T10:00:00Z' }, { owner: 'a', am: '2026-08-01T10:00:00Z' }, { owner: 'b', am: '2026-09-20' }],
      '2026-10-05',
      '2026-09-05',
    );
    expect(a.workload).toBe(100);
    expect(a.erledigt_30d).toBe(1);
  });
});
