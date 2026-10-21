import { describe, it, expect } from 'vitest';
import { berechneSkalierung } from '../skalierung';
import { STANDARD_SCHWELLEN } from '../auslastung';
import type { Opp, StatusEvent } from '../compute';

const statuses = [
  { id: 'st', label: 'Setting - Terminiert', type: 'active' },
  { id: 'sfu', label: 'Setting - Follow Up', type: 'active' },
  { id: 'ct', label: 'Closing - Terminiert', type: 'active' },
];
const jetzt = new Date('2026-10-21T12:00:00Z');
const opp = (i: number): Opp => ({ id: `o${i}`, lead_id: `l${i}`, status_id: 'st', value: 0, date_created: `2026-10-${String(8 + (i % 14)).padStart(2, '0')}T09:00:00Z`, date_won: null, user_id: 'u' });

describe('berechneSkalierung', () => {
  it('rechnet Leads, Kosten je Lead und Bedarf für einen vollen Setter', () => {
    const opps = Array.from({ length: 28 }, (_, i) => opp(i)); // 2 Leads/Tag
    const events: StatusEvent[] = opps.slice(0, 14).map((o) => ({ opportunity_id: o.id, old_status_id: 'st', new_status_id: 'ct', date: '2026-10-20T10:00:00Z', user_id: 'u' }));
    const k = berechneSkalierung({ opps, statuses, events, meta: { spend: 2800, leads: 30 }, schwellen: STANDARD_SCHWELLEN, jetzt, ziel: 300_000 });
    expect(k.leads).toBe(28);
    expect(k.leadsProTag).toBe(2);
    expect(k.kostenJeLead).toBe(100);
    expect(k.settingQuote).toBe(50);
    expect(k.spendProTag).toBe(200);
    // 15 × 5 / 7 ≈ 10,7 Settings je Kalendertag ÷ 50 % → 22 Leads → 2.200 €/Tag
    expect(k.leadsFuerSetter).toBe(22);
    expect(k.budgetFuerSetter).toBe(2200);
    expect(k.mehrBudgetProTag).toBe(2000);
  });
  it('ohne Meta: Leads ja, Budget null', () => {
    const k = berechneSkalierung({ opps: [opp(1)], statuses, events: [], meta: null, schwellen: STANDARD_SCHWELLEN, jetzt, ziel: 300_000 });
    expect(k.kostenJeLead).toBeNull();
    expect(k.leadsFuerSetter).toBeNull();
  });
});
