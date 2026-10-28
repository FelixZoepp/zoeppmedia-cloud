import { describe, expect, it } from 'vitest';
import { tagesVerlauf, type Eingaben } from '../compute';

const basis = (von: string, bis: string, extra: Partial<Eingaben> = {}) =>
  ({
    statuses: [],
    opps: [],
    events: [],
    leadQuellen: new Map(),
    users: new Map(),
    metaZeitraum: null,
    metaVergleich: null,
    metaMonate: new Map(),
    zeitraum: { von, bis, label: '' },
    jetzt: new Date('2026-10-28T12:00:00Z'),
    ziel: 0,
    ...extra,
  }) as Eingaben;

describe('tagesVerlauf', () => {
  it('zählt je Tag und endet heute', () => {
    const e = basis('2026-10-01', '2026-11-01', {
      metaTage: new Map([['2026-10-02', { spend: 12.345, leads: 2 }]]),
      opps: [{ id: 'o1', lead_id: 'l1', date_created: '2026-10-02T09:00:00Z', upsell: false } as never],
    });
    const ü = [{ opp: 'o1', von: null, nach: 'setting', date: '2026-10-03T10:00:00Z', user_id: null }] as never;
    const p = tagesVerlauf(e, ü, '2026-10-29');
    expect(p).toHaveLength(28);
    expect(p[1]).toMatchObject({ tag: '2026-10-02', spend: 12.35, metaLeads: 2, anfragen: 1 });
    expect(p[2].settings).toBe(1);
  });

  it('fasst lange Zeiträume wochenweise zusammen', () => {
    const p = tagesVerlauf(basis('2026-01-01', '2026-10-29'), [], '2026-10-29');
    expect(p.length).toBe(Math.ceil(301 / 7));
  });

  it('keine Welle bei weniger als 3 Tagen', () => {
    expect(tagesVerlauf(basis('2026-10-28', '2026-10-29'), [], '2026-10-29')).toEqual([]);
  });
});
