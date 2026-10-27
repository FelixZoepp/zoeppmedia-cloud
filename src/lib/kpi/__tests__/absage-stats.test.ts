import { describe, expect, it } from 'vitest';
import { berechneAbsageStats, type AbsageZeile } from '../absage-stats';

const z = (id: string, code: string | null, am: string, phase: string | null = null, notiz: string | null = null): AbsageZeile => ({
  id,
  name: `B${id}`,
  absage_code: code,
  absage_notiz: notiz,
  absage_phase_id: phase,
  abgesagt_am: am,
});

describe('berechneAbsageStats', () => {
  it('zählt nach Grund, Gruppe, Phase und Woche', () => {
    const s = berechneAbsageStats(
      [
        z('1', 'wenig_energie', '2026-10-20T10:00:00Z', 'p1'),
        z('2', 'wenig_energie', '2026-10-21T10:00:00Z', 'p1'),
        z('3', 'probetag_nicht_erschienen', '2026-10-27T10:00:00Z', 'p2', 'kam nicht'),
        z('4', null, '2026-10-27T11:00:00Z'),
      ],
      new Map([
        ['p1', 'Erstgespräch'],
        ['p2', 'Probetag'],
      ]),
    );
    expect(s.gesamt).toBe(4);
    expect(s.ohneGrund).toBe(1);
    expect(s.proGrund[0]).toMatchObject({ code: 'wenig_energie', anzahl: 2, anteil: 0.5 });
    expect(s.proGruppe.find((g) => g.key === 'eindruck')?.anzahl).toBe(2);
    expect(s.proPhase[0]).toMatchObject({ phase: 'Erstgespräch', anzahl: 2 });
    expect(s.proPhase.find((p) => p.phase === 'Unbekannt')?.anzahl).toBe(1);
    expect(s.proWoche.map((w) => [w.woche, w.anzahl])).toEqual([
      ['2026-10-19', 2],
      ['2026-10-26', 2],
    ]);
    expect(s.letzte[0].id).toBe('4');
    expect(s.letzte.find((l) => l.id === '3')).toMatchObject({ phase: 'Probetag', notiz: 'kam nicht' });
  });

  it('leer', () => {
    expect(berechneAbsageStats([], new Map()).gesamt).toBe(0);
  });
});
