import { describe, it, expect } from 'vitest';
import { berechneSalesControlling, berechneUpsellPipeline, type Eingaben, type Opp, type StatusEvent } from '../compute';

const S = [
  { id: 'ct', label: 'Closing - Terminiert', type: 'active' },
  { id: 'won', label: 'Close', type: 'won' },
  { id: 'lost', label: 'Verloren', type: 'lost' },
  { id: 'up-pot', label: 'Upsell - Potenzial erkannt', type: 'active' },
  { id: 'up-strat', label: 'Upsell - Strategietermin gelegt', type: 'active' },
  { id: 'up-ent', label: 'Upsell - Entscheidung offen', type: 'active' },
  { id: 'up-won', label: 'Upsell - Gewonnen', type: 'won' },
  { id: 'up-lost', label: 'Upsell - Verloren', type: 'lost' },
];

const opp = (id: string, status: string, value: number, created: string, extra: Partial<Opp> = {}): Opp => ({
  id, lead_id: `l-${id}`, lead_name: `Firma ${id}`, status_id: status, value, date_created: created, date_won: null, user_id: 'u1', ...extra,
});
const ev = (o: string, from: string, to: string, date: string): StatusEvent => ({ opportunity_id: o, old_status_id: from, new_status_id: to, date, user_id: 'u1' });

function eingaben(opps: Opp[], events: StatusEvent[]): Eingaben {
  return {
    statuses: S,
    opps,
    events,
    leadQuellen: new Map(),
    users: new Map([['u1', 'Felix']]),
    metaZeitraum: { spend: 1000, leads: 10 },
    metaVergleich: null,
    metaMonate: new Map(),
    zeitraum: { von: '2026-10-01', bis: '2026-11-01', label: 'Oktober' },
    jetzt: new Date('2026-10-19T12:00:00Z'),
    ziel: 300000,
  };
}

describe('Upsell-Pipeline im Controlling', () => {
  const opps = [
    // Neukunde: Closing gehalten → gewonnen
    opp('neu', 'won', 6000, '2026-10-02T09:00:00Z', { date_won: '2026-10-05' }),
    // Upsell gewonnen
    opp('up1', 'up-won', 20000, '2026-10-03T09:00:00Z', { upsell: true, date_won: '2026-10-10' }),
    // offene Upsells: einer mit gepflegter Chance, einer ohne (0 % = Standard der Stufe)
    opp('up2', 'up-ent', 10000, '2026-10-04T09:00:00Z', { upsell: true, confidence: 80 }),
    opp('up3', 'up-pot', 50000, '2026-10-04T09:00:00Z', { upsell: true, confidence: 0 }),
    // Upsell verloren
    opp('up4', 'up-lost', 5000, '2026-10-04T09:00:00Z', { upsell: true }),
  ];
  const events = [ev('neu', 'ct', 'won', '2026-10-05T10:00:00Z'), ev('up1', 'up-strat', 'up-won', '2026-10-10T10:00:00Z'), ev('up4', 'up-pot', 'up-lost', '2026-10-06T10:00:00Z')];
  const r = berechneSalesControlling(eingaben(opps, events));

  it('Umsatz enthält Upsells, Neukunden-Quoten nicht', () => {
    expect(r.zahlen.auftragsvolumen).toBe(26000);
    expect(r.zahlen.gewonnen).toBe(2);
    expect(r.zahlen.gewonnenNeu).toBe(1);
    expect(r.zahlen.volumenUpsell).toBe(20000);
    expect(r.zahlen.schnittDeal).toBe(6000);
    expect(r.zahlen.closingZuAbschluss).toBe(100);
    // Upsell-Deals sind keine neuen Anfragen und kein Verlust im Neukunden-Funnel
    expect(r.zahlen.neueAnfragen).toBe(1);
    expect(r.zahlen.verloren).toBe(0);
  });

  it('Akquisekosten und ROAS nur mit Neukunden', () => {
    expect(r.marketing.kundenakquisekosten).toBe(1000);
    expect(r.marketing.roas).toBe(6);
  });

  it('offene Upsells gewichtet – abschlussnah fließt in den Forecast', () => {
    expect(r.upsellPipeline.offenAnzahl).toBe(2);
    expect(r.upsellPipeline.offenWert).toBe(60000);
    // 10.000 × 80 % + 50.000 × 10 % (Standard „Potenzial“)
    expect(r.upsellPipeline.gewichtet).toBe(13000);
    expect(r.upsellPipeline.abschlussnahGewichtet).toBe(8000);
    expect(r.ziel.forecast).toBe(26000 + r.pipeline.abschlussnahGewichtet + 8000);
  });

  it('Upsell-Deals stehen nicht in der Neukunden-Pipeline', () => {
    expect(r.pipeline.offenAnzahl).toBe(0);
  });
});

describe('berechneUpsellPipeline', () => {
  it('Stufe aus dem Label, Tage ohne Bewegung', () => {
    const p = berechneUpsellPipeline({ statuses: S, opps: [opp('x', 'up-strat', 1000, '2026-10-01T00:00:00Z', { upsell: true })] }, new Date('2026-10-11T00:00:00Z'));
    expect(p.deals[0]).toMatchObject({ stufe: 'strategietermin', chance: 25, gewichtet: 250, tageOhneBewegung: 10 });
  });
});
