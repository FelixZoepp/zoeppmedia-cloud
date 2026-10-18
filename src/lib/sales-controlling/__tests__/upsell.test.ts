import { describe, expect, it } from 'vitest';
import { berechneUpsell, kundenSchluessel } from '../upsell';
import type { Opp } from '../compute';

const statuses = [
  { id: 'won', label: 'Close', type: 'won' },
  { id: 'offen', label: 'Closing - Terminiert', type: 'active' },
];
const opp = (id: string, lead: string, name: string, value: number, datum: string, status = 'won'): Opp => ({
  id,
  lead_id: lead,
  lead_name: name,
  status_id: status,
  value,
  date_created: `${datum}T10:00:00Z`,
  date_won: datum,
  user_id: null,
});

describe('kundenSchluessel', () => {
  it('führt Doppel-Leads mit Rechtsform zusammen', () => {
    expect(kundenSchluessel('B&C Direct Sales GmbH', 'a')).toBe(kundenSchluessel('B&C Direct Sales', 'b'));
    expect(kundenSchluessel('', 'lead_x')).toBe('lead_x');
  });
});

describe('berechneUpsell', () => {
  const opps = [
    opp('1', 'l1', 'B&C Direct Sales GmbH', 6000, '2026-04-07'),
    opp('2', 'l1', 'B&C Direct Sales GmbH', 7000, '2026-07-01'),
    opp('3', 'l9', 'B&C Direct Sales', 2000, '2026-10-10'),
    opp('4', 'l2', 'Solo GmbH', 5000, '2026-08-01'),
    opp('5', 'l3', 'Neu UG', 4000, '2026-10-12'),
    opp('6', 'l3', 'Neu UG', 9999, '2026-10-13', 'offen'),
  ];
  const u = berechneUpsell({ opps, statuses, zeitraum: { von: '2026-10-01', bis: '2026-11-01' }, jetzt: new Date('2026-10-18T12:00:00Z') });

  it('zählt Kunden, Nachkäufer und Volumen', () => {
    expect(u.kunden).toBe(3);
    expect(u.kundenMitUpsell).toBe(1);
    expect(u.quote).toBe(33.3);
    expect(u.upsellVolumen).toBe(9000);
    expect(u.gesamtVolumen).toBe(24000);
    expect(u.volumenAnteil).toBe(37.5);
  });
  it('reife Quote nur mit Kunden, deren erster Kauf ≥ 6 Wochen her ist', () => {
    expect(u.kundenReif).toBe(2);
    expect(u.quoteReif).toBe(50);
  });
  it('trennt im Zeitraum Neukauf und Upsell', () => {
    expect(u.zeitraum.neukauf).toEqual({ anzahl: 1, volumen: 4000 });
    expect(u.zeitraum.upsell).toEqual({ anzahl: 1, volumen: 2000 });
    expect(u.nachkaeufer[0]).toMatchObject({ kunde: 'B&C Direct Sales GmbH', deals: 3, upsellVolumen: 9000 });
  });
});
