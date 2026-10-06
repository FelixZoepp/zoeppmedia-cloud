import { describe, it, expect } from 'vitest';
import { berechneSalesControlling, klassifiziere, type Eingaben, type Opp, type StatusEvent } from '../compute';

const S = {
  st: { id: 'st', label: 'Setting - Terminiert', type: 'active' },
  sns: { id: 'sns', label: 'Setting - No Show', type: 'active' },
  sfu: { id: 'sfu', label: 'Setting - Follow Up', type: 'active' },
  ct: { id: 'ct', label: 'Closing - Terminiert', type: 'active' },
  cns: { id: 'cns', label: 'Closing - No Show', type: 'active' },
  cfu: { id: 'cfu', label: 'Closing - Follow Up', type: 'active' },
  ang: { id: 'ang', label: 'Angebot verschickt', type: 'active' },
  cc2: { id: 'cc2', label: 'CC2 - Terminiert', type: 'active' },
  won: { id: 'won', label: 'Close', type: 'won' },
  lost: { id: 'lost', label: 'Verloren', type: 'lost' },
};

const opp = (id: string, status: string, value: number, created: string, user = 'u1'): Opp => ({
  id, lead_id: `l-${id}`, status_id: status, value, date_created: created, date_won: null, user_id: user,
});
const ev = (opp: string, from: string, to: string, date: string, user = 'u1'): StatusEvent => ({
  opportunity_id: opp, old_status_id: from, new_status_id: to, date, user_id: user,
});

function eingaben(opps: Opp[], events: StatusEvent[], extra: Partial<Eingaben> = {}): Eingaben {
  return {
    statuses: Object.values(S),
    opps,
    events,
    leadQuellen: new Map(opps.map((o) => [o.lead_id, o.id === 'a' ? 'Meta Ads' : null])),
    users: new Map([['u1', 'Felix'], ['u2', 'Sarah']]),
    metaZeitraum: { spend: 3000, leads: 30 },
    metaVergleich: { spend: 2000, leads: 20 },
    metaMonate: new Map([['2026-10', { spend: 3000, leads: 30 }], ['2026-09', { spend: 4000, leads: 40 }], ['2026-08', { spend: 2000, leads: 20 }]]),
    zeitraum: { von: '2026-10-01', bis: '2026-11-01', label: 'Oktober' },
    jetzt: new Date('2026-10-11T12:00:00Z'),
    ziel: 300000,
    ...extra,
  };
}

describe('klassifiziere', () => {
  it('ordnet die Close-Status den Stufen zu', () => {
    expect(klassifiziere(S.st)).toBe('setting');
    expect(klassifiziere(S.sns)).toBe('setting_noshow');
    expect(klassifiziere(S.cfu)).toBe('closing_followup');
    expect(klassifiziere(S.ang)).toBe('angebot');
    expect(klassifiziere(S.cc2)).toBe('cc2');
    expect(klassifiziere(S.won)).toBe('won');
    expect(klassifiziere(S.lost)).toBe('lost');
  });
});

describe('berechneSalesControlling', () => {
  // a: Setting → Closing → Angebot → gewonnen (10.000 €)
  // b: Setting → No-Show → neu terminiert → gehalten → Closing → No-Show
  // c: Setting gehalten → Follow-up, seit September ohne Bewegung (Wert 5.000)
  // d: September gewonnen (8.000 €)
  const opps = [
    opp('a', 'won', 10000, '2026-10-01T09:00:00Z'),
    opp('b', 'cns', 6000, '2026-10-02T09:00:00Z'),
    opp('c', 'sfu', 5000, '2026-09-01T09:00:00Z'),
    opp('d', 'won', 8000, '2026-08-20T09:00:00Z', 'u2'),
  ];
  const events = [
    ev('a', 'st', 'ct', '2026-10-03T10:00:00Z'),
    ev('a', 'ct', 'ang', '2026-10-05T10:00:00Z'),
    ev('a', 'ang', 'won', '2026-10-08T10:00:00Z'),
    ev('b', 'st', 'sns', '2026-10-03T10:00:00Z'),
    ev('b', 'sns', 'st', '2026-10-04T10:00:00Z'),
    ev('b', 'st', 'ct', '2026-10-06T10:00:00Z'),
    ev('b', 'ct', 'cns', '2026-10-09T10:00:00Z'),
    ev('c', 'st', 'sfu', '2026-09-05T10:00:00Z'),
    ev('d', 'ct', 'won', '2026-09-10T10:00:00Z', 'u2'),
  ];
  const r = berechneSalesControlling(eingaben(opps, events));

  it('zählt Setting und Closing im Zeitraum mit Show-Quoten', () => {
    expect(r.zahlen.neueAnfragen).toBe(2);
    expect(r.zahlen.settingGebucht).toBe(3); // a, b, b (neu terminiert)
    expect(r.zahlen.settingNoShow).toBe(1);
    expect(r.zahlen.settingGehalten).toBe(2); // a → Closing, b → Closing
    expect(r.zahlen.settingShowQuote).toBe(66.7);
    expect(r.zahlen.closingGebucht).toBe(2);
    expect(r.zahlen.closingNoShow).toBe(1);
    expect(r.zahlen.closingGehalten).toBe(1); // a → Angebot
    expect(r.zahlen.closingShowQuote).toBe(50);
    expect(r.zahlen.angebote).toBe(1);
  });

  it('rechnet Auftragsvolumen nur aus Deals, die im Zeitraum gewonnen wurden', () => {
    expect(r.zahlen.gewonnen).toBe(1);
    expect(r.zahlen.auftragsvolumen).toBe(10000);
    expect(r.zahlen.zyklusTage).toBe(7);
    expect(r.vergleich.auftragsvolumen).toBe(8000); // September
  });

  it('Marketing: Kosten pro Stufe, ROAS und Quellen', () => {
    expect(r.marketing.cpl).toBe(100);
    expect(r.marketing.kostenProSetting).toBe(1000);
    expect(r.marketing.kundenakquisekosten).toBe(3000);
    expect(r.marketing.roas).toBe(3.3);
    expect(r.marketing.quellen).toEqual([{ quelle: 'Meta Ads', anzahl: 1 }, { quelle: 'Unbekannt', anzahl: 1 }]);
  });

  it('Ziel: Stand, Soll bis heute, Rückwärtsrechnung', () => {
    expect(r.ziel.erreicht).toBe(10000);
    expect(r.ziel.vergangeneTage).toBe(11);
    expect(r.ziel.sollBisHeute).toBe(Math.round((300000 * 11) / 31));
    expect(r.ziel.rest).toBe(290000);
    // Ø Deal der letzten 90 Tage: (10.000 + 8.000) / 2
    expect(r.ziel.schnittDeal).toBe(9000);
    expect(r.ziel.bedarfRest.deals).toBe(Math.ceil(290000 / 9000));
    expect(r.ziel.bedarfRest.anfragen).toBeGreaterThan(r.ziel.bedarfRest.settingsGebucht - 1);
  });

  it('Pipeline gewichtet und Problemfelder', () => {
    const fu = r.pipeline.proStufe.find((x) => x.stufe === 'setting_followup')!;
    expect(fu).toMatchObject({ anzahl: 1, wert: 5000, ohneBewegung14Tage: 1 });
    expect(r.pipeline.offenAnzahl).toBe(2);
    const titel = r.probleme.map((p) => p.titel).join(' | ');
    expect(titel).toMatch(/Setting-Show-Quote/);
    expect(titel).toMatch(/ohne Bewegung/);
    expect(titel).toMatch(/Pipeline reicht nicht/);
    expect(r.probleme[0].stufe).toBe('kritisch');
  });

  it('Personen und Verlauf', () => {
    expect(r.personen.find((p) => p.name === 'Felix')).toMatchObject({ gewonnen: 1, volumen: 10000 });
    expect(r.verlauf).toHaveLength(6);
    expect(r.verlauf.at(-1)).toMatchObject({ monat: '2026-10', auftragsvolumen: 10000, deals: 1 });
    expect(r.verlauf.at(-2)).toMatchObject({ monat: '2026-09', auftragsvolumen: 8000 });
  });

  it('kommt ohne Daten aus', () => {
    const leer = berechneSalesControlling(eingaben([], [], { metaZeitraum: null, metaVergleich: null, metaMonate: new Map() }));
    expect(leer.zahlen.auftragsvolumen).toBe(0);
    expect(leer.ziel.schnittDeal).toBe(7190);
    expect(leer.marketing.roas).toBeNull();
  });
});

describe('Abschlussdatum', () => {
  it('zählt gewonnene Deals am Close-Datum, nicht am Tag des (nachgetragenen) Statuswechsels', () => {
    // Deal im Juli abgeschlossen, aber erst am 08.08. in Close auf „Close“ gesetzt
    const alt = { ...opp('x', 'won', 14700, '2026-07-03T09:00:00Z'), date_won: '2026-07-02' };
    const events = [ev('x', 'ct', 'won', '2026-08-08T13:41:00Z')];
    const juli = berechneSalesControlling(eingaben([alt], events, { zeitraum: { von: '2026-07-01', bis: '2026-08-01', label: 'Juli' } }));
    const august = berechneSalesControlling(eingaben([alt], events, { zeitraum: { von: '2026-08-01', bis: '2026-09-01', label: 'August' } }));
    expect(juli.zahlen.auftragsvolumen).toBe(14700);
    expect(juli.zahlen.gewonnen).toBe(1);
    expect(august.zahlen.auftragsvolumen).toBe(0);
  });
});
