import { describe, expect, it } from 'vitest';
import { berechneCashplan, endetBald, laufzeitEnde, monateAb, type FinanzVertrag } from '../cashplan';

const v = (p: Partial<FinanzVertrag>): FinanzVertrag => ({
  id: p.kunde ?? 'x',
  kunde: 'x',
  monatlich: 0,
  setup: 0,
  setup_monat: null,
  start: '2026-11-01',
  laufzeit_monate: null,
  verlaengerung_monatlich: null,
  ust_satz: 19,
  rechnungstag: 1,
  status: 'aktiv',
  notiz: null,
  ...p,
});

describe('Cash-Plan', () => {
  it('Monate über den Jahreswechsel', () => {
    expect(monateAb('2026-11-01', 4)).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('Start im Januar: Setup + erste Monatsgebühr im ersten Monat, danach nur Gebühr', () => {
    const plan = berechneCashplan([v({ kunde: 'Pflug', monatlich: 1000, setup: 2000, start: '2027-01-01', laufzeit_monate: 3 })], '2026-12-01', 5);
    expect(plan.map((m) => m.gesamt)).toEqual([0, 3000, 1000, 1000, 0]);
  });

  it('Verlängerung nur in der Sicht „mit Verlängerung“', () => {
    const plan = berechneCashplan([v({ monatlich: 1666.66, start: '2026-12-01', laufzeit_monate: 3, verlaengerung_monatlich: 1000 })], '2026-12-01', 5);
    expect(plan.map((m) => m.gesamt)).toEqual([1666.66, 1666.66, 1666.66, 1000, 1000]);
    expect(plan.map((m) => m.nurLaufzeit)).toEqual([1666.66, 1666.66, 1666.66, 0, 0]);
  });

  it('unbefristet läuft weiter, beendet zählt nicht, Brutto mit USt-Satz', () => {
    const plan = berechneCashplan(
      [v({ monatlich: 3500 }), v({ monatlich: 5000, ust_satz: 0 }), v({ monatlich: 999, status: 'beendet' })],
      '2026-11-01',
      2,
    );
    expect(plan[1].gesamt).toBe(8500);
    expect(plan[1].brutto).toBe(9165);
  });

  it('Laufzeitende und bald endende Verträge', () => {
    const a = v({ kunde: 'Meier', monatlich: 1500, start: '2026-10-01', laufzeit_monate: 3 });
    expect(laufzeitEnde(a)).toBe('2026-12');
    expect(endetBald([a, v({ kunde: 'Krüger', monatlich: 3500 })], '2026-11-01').map((x) => x.kunde)).toEqual(['Meier']);
  });
});
