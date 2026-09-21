/**
 * Tests für den KPI-Rechenkern (Phase 6 Task 3).
 * Fixture manuell auszählbar: 10 Bewerbungen, exakte Quoten.
 */

import { describe, it, expect } from 'vitest';
import {
  median,
  computeRecruitingKpis,
  type KpiAppRow,
  type KpiAppointmentRow,
  type KpiInput,
} from '../recruiting-kpis';

// ---------------------------------------------------------------------------
// Hilfsfunktion: ISO-Zeitstring erzeugen
// ---------------------------------------------------------------------------
function iso(date: string, offsetSek = 0): string {
  return new Date(new Date(date).getTime() + offsetSek * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Fixture: 10 Bewerbungen
//  - app1..app8: haben ≥1 ausgehende Nachricht (appsWithOutbound)
//  - app1..app6: haben ≥1 eingehende Nachricht (appsWithInbound)
//  - score_label gesetzt: app1=A, app2=A, app3=B, app4=C, app5=C → vorqualiAbgeschlossen=5
//  - qualifiziert (A oder B): app1, app2, app3 → qualifiziert=3
//  - Termine: app1 booked, app2 done, app3 no_show, app4 cancelled
//    → gebucht (booked/confirmed/done/no_show): app1,app2,app3 → termineGebucht=3
//    → fällig (done/no_show): app2,app3 → 2 fällige, davon 1 no_show → noShowQuote=0.5
//  - Einstellung: app1 status='hired' → einstellungen=1
// Erwartungen:
//  antwortquote        = 6/8  = 0.75
//  bot.abschlussquote  = 5/6  (completed/withReply)
//  qualifizierungsquote = 3/5 = 0.6
//  terminquote         = 3/3  = 1
//  noShowQuote         = 1/2  = 0.5
// ---------------------------------------------------------------------------

const BASE_DATE = '2025-01-10T08:00:00.000Z';

const apps: KpiAppRow[] = [
  { id: 'app1',  job_id: 'j1', source: 'linkedin', score_label: 'A', status: 'hired',    stage_type: null,    applied_at: BASE_DATE },
  { id: 'app2',  job_id: 'j1', source: 'linkedin', score_label: 'A', status: 'active',   stage_type: null,    applied_at: BASE_DATE },
  { id: 'app3',  job_id: 'j1', source: 'indeed',   score_label: 'B', status: 'active',   stage_type: null,    applied_at: BASE_DATE },
  { id: 'app4',  job_id: 'j1', source: 'indeed',   score_label: 'C', status: 'active',   stage_type: null,    applied_at: BASE_DATE },
  { id: 'app5',  job_id: 'j2', source: 'referral', score_label: 'C', status: 'active',   stage_type: null,    applied_at: BASE_DATE },
  { id: 'app6',  job_id: 'j2', source: 'referral', score_label: null, status: 'active',  stage_type: null,    applied_at: BASE_DATE },
  { id: 'app7',  job_id: 'j2', source: 'direct',   score_label: null, status: 'active',  stage_type: null,    applied_at: BASE_DATE },
  { id: 'app8',  job_id: 'j2', source: 'direct',   score_label: null, status: 'active',  stage_type: null,    applied_at: BASE_DATE },
  { id: 'app9',  job_id: 'j3', source: 'linkedin', score_label: null, status: 'active',  stage_type: null,    applied_at: BASE_DATE },
  { id: 'app10', job_id: 'j3', source: 'linkedin', score_label: null, status: 'active',  stage_type: null,    applied_at: BASE_DATE },
];

const appsWithOutbound = new Set(['app1','app2','app3','app4','app5','app6','app7','app8']);
const appsWithInbound  = new Set(['app1','app2','app3','app4','app5','app6']);

// Erster Outbound-Zeitpunkt = applied_at + 3600 Sekunden (1 Stunde später)
const firstOutboundAt = new Map<string, string>([
  ['app1', iso(BASE_DATE, 3600)],
  ['app2', iso(BASE_DATE, 7200)],
  ['app3', iso(BASE_DATE, 1800)],
  ['app4', iso(BASE_DATE, 5400)],
]);

const appointments: KpiAppointmentRow[] = [
  { application_id: 'app1', status: 'booked',    created_at: iso(BASE_DATE, 86400) },
  { application_id: 'app2', status: 'done',      created_at: iso(BASE_DATE, 86400) },
  { application_id: 'app3', status: 'no_show',   created_at: iso(BASE_DATE, 86400) },
  { application_id: 'app4', status: 'cancelled', created_at: iso(BASE_DATE, 86400) },
];

const botConversations = {
  total: 10,
  handedOver: 4,
  messagesPerApp: new Map([
    ['app1', 5], ['app2', 3], ['app3', 7], ['app4', 2], ['app5', 4], ['app6', 6],
  ]),
};

const defaultInput: KpiInput = {
  apps,
  appsWithOutbound,
  appsWithInbound,
  firstOutboundAt,
  appointments,
  botConversations,
};

const knockoutReasons = [
  'Zu wenig Erfahrung', 'Zu wenig Erfahrung',
  'Falscher Standort', 'Falscher Standort', 'Falscher Standort',
  'Keine Führungsschein',
  'Gehaltsvorstellung zu hoch', 'Gehaltsvorstellung zu hoch',
  'Branche unpassend',
  'Branche unpassend', 'Branche unpassend', 'Branche unpassend',
  // 6. Grund (wird nicht in Top-5 aufgenommen, falls 5 andere häufiger)
  'Sonstiges',
];

// ---------------------------------------------------------------------------
// Tests: median()
// ---------------------------------------------------------------------------
describe('median()', () => {
  it('gibt null bei leerer Liste zurück', () => {
    expect(median([])).toBeNull();
  });

  it('gibt den einzigen Wert zurück', () => {
    expect(median([42])).toBe(42);
  });

  it('gibt den Mittelpunkt bei ungerader Anzahl zurück', () => {
    expect(median([1, 3, 2])).toBe(2);
  });

  it('gibt den Durchschnitt der zwei mittleren Werte zurück', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('sortiert Werte vor Berechnung', () => {
    expect(median([10, 1, 5, 3, 8])).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// Tests: computeRecruitingKpis() — Tiles
// ---------------------------------------------------------------------------
describe('computeRecruitingKpis() — Tiles', () => {
  const result = computeRecruitingKpis(defaultInput, knockoutReasons);

  it('zählt alle Bewerbungen korrekt (bewerbungen=10)', () => {
    expect(result.tiles.bewerbungen).toBe(10);
  });

  it('berechnet antwortquote = 6/8 = 0.75', () => {
    expect(result.tiles.antwortquote).toBeCloseTo(0.75);
  });

  it('zählt vorqualiAbgeschlossen = 5 (score_label gesetzt)', () => {
    expect(result.tiles.vorqualiAbgeschlossen).toBe(5);
  });

  it('zählt qualifiziert = 3 (A oder B)', () => {
    expect(result.tiles.qualifiziert).toBe(3);
  });

  it('zählt termineGebucht = 3 (booked+done+no_show)', () => {
    expect(result.tiles.termineGebucht).toBe(3);
  });

  it('berechnet noShowQuote = 1/2 = 0.5', () => {
    expect(result.tiles.noShowQuote).toBeCloseTo(0.5);
  });

  it('zählt einstellungen = 1 (status=hired)', () => {
    expect(result.tiles.einstellungen).toBe(1);
  });

  it('gibt antwortquote null zurück wenn kein Outbound vorhanden', () => {
    const emptyInput: KpiInput = {
      ...defaultInput,
      appsWithOutbound: new Set<string>(),
      appsWithInbound: new Set<string>(),
    };
    const res = computeRecruitingKpis(emptyInput, []);
    expect(res.tiles.antwortquote).toBeNull();
  });

  it('erkennt Einstellung über stage_type=hired (nicht nur status)', () => {
    const withStageHired: KpiInput = {
      ...defaultInput,
      apps: [
        ...apps,
        { id: 'app11', job_id: 'j4', source: 'direct', score_label: null, status: 'active', stage_type: 'hired', applied_at: BASE_DATE },
      ],
    };
    const res = computeRecruitingKpis(withStageHired, []);
    // app1 (status=hired) + app11 (stage_type=hired) = 2
    expect(res.tiles.einstellungen).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Tests: Funnel
// ---------------------------------------------------------------------------
describe('computeRecruitingKpis() — Funnel', () => {
  const result = computeRecruitingKpis(defaultInput, knockoutReasons);

  it('liefert genau 6 Funnel-Schritte', () => {
    expect(result.funnel).toHaveLength(6);
  });

  it('erste Funnel-Stufe: key=bewerbung, count=10, dropRate=null', () => {
    const step = result.funnel[0];
    expect(step.key).toBe('bewerbung');
    expect(step.count).toBe(10);
    expect(step.dropRate).toBeNull();
  });

  it('zweite Funnel-Stufe: key=antwort, count=6, dropRate=1-6/10=0.4', () => {
    const step = result.funnel[1];
    expect(step.key).toBe('antwort');
    expect(step.count).toBe(6);
    expect(step.dropRate).toBeCloseTo(0.4);
  });

  it('dritte Funnel-Stufe: key=vorquali, count=5, dropRate=1-5/6', () => {
    const step = result.funnel[2];
    expect(step.key).toBe('vorquali');
    expect(step.count).toBe(5);
    expect(step.dropRate).toBeCloseTo(1 - 5 / 6);
  });

  it('vierte Funnel-Stufe: key=qualifiziert, count=3, dropRate=1-3/5=0.4', () => {
    const step = result.funnel[3];
    expect(step.key).toBe('qualifiziert');
    expect(step.count).toBe(3);
    expect(step.dropRate).toBeCloseTo(0.4);
  });

  it('fünfte Funnel-Stufe: key=termin, count=3, dropRate=0', () => {
    const step = result.funnel[4];
    expect(step.key).toBe('termin');
    expect(step.count).toBe(3);
    expect(step.dropRate).toBeCloseTo(0);
  });

  it('sechste Funnel-Stufe: key=eingestellt, count=1', () => {
    const step = result.funnel[5];
    expect(step.key).toBe('eingestellt');
    expect(step.count).toBe(1);
  });

  it('dropRate null wenn Vorgänger count=0', () => {
    const zeroInput: KpiInput = {
      ...defaultInput,
      apps: apps.map((a) => ({ ...a, score_label: null, status: 'active', stage_type: null })),
      appsWithOutbound: new Set<string>(),
      appsWithInbound: new Set<string>(),
      appointments: [],
    };
    const res = computeRecruitingKpis(zeroInput, []);
    // antwort-Schritt: Vorgänger bewerbung=10>0, also kein null-Problem
    // vorquali: Vorgänger antwort=0 → dropRate null
    const vorquali = res.funnel.find((s) => s.key === 'vorquali');
    expect(vorquali?.dropRate).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Sources
// ---------------------------------------------------------------------------
describe('computeRecruitingKpis() — Sources', () => {
  const result = computeRecruitingKpis(defaultInput, knockoutReasons);

  it('liefert eine Zeile pro eindeutiger Quelle', () => {
    const sources = result.sources.map((s) => s.source).sort();
    expect(sources).toEqual(['direct', 'indeed', 'linkedin', 'referral'].sort());
  });

  it('linkedin: count=4 (app1,app2,app9,app10)', () => {
    const linkedin = result.sources.find((s) => s.source === 'linkedin')!;
    expect(linkedin.count).toBe(4);
  });

  it('linkedin: qualifizierungsquote = 2/3 (A:app1,A:app2 von abgeschlossenen app1,app2,app5 — Korrektur: nur linkedin-Apps)', () => {
    // linkedin-Apps: app1(A), app2(A), app9(null), app10(null)
    // abgeschlossen (score_label!=null): app1, app2 → 2
    // qualifiziert (A/B): app1, app2 → 2
    // qualifizierungsquote = 2/2 = 1
    const linkedin = result.sources.find((s) => s.source === 'linkedin')!;
    expect(linkedin.qualifizierungsquote).toBeCloseTo(1);
  });

  it('indeed: qualifizierungsquote = 1/2 (app3=B qualifiziert, app4=C nicht)', () => {
    // indeed-Apps: app3(B,qualifiziert), app4(C,nicht qualifiziert)
    // abgeschlossen=2, qualifiziert=1 → 1/2=0.5
    const indeed = result.sources.find((s) => s.source === 'indeed')!;
    expect(indeed.qualifizierungsquote).toBeCloseTo(0.5);
  });

  it('terminquote null wenn keine qualifizierten Apps in Quelle', () => {
    // direct: app7(null), app8(null) → qualifiziert=0 → terminquote=null
    const direct = result.sources.find((s) => s.source === 'direct')!;
    expect(direct.terminquote).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: Timeline
// ---------------------------------------------------------------------------
describe('computeRecruitingKpis() — Timeline', () => {
  it('gruppiert nach Tag (YYYY-MM-DD)', () => {
    const result = computeRecruitingKpis(defaultInput, knockoutReasons);
    // Alle Apps haben denselben BASE_DATE → ein einziger Tag
    expect(result.timeline).toHaveLength(1);
    expect(result.timeline[0].day).toBe('2025-01-10');
  });

  it('zählt Bewerbungen pro Quelle pro Tag', () => {
    const result = computeRecruitingKpis(defaultInput, knockoutReasons);
    const day = result.timeline[0];
    // linkedin: app1,app2,app9,app10=4; indeed: app3,app4=2; referral: app5,app6=2; direct: app7,app8=2
    expect(day.bySource['linkedin']).toBe(4);
    expect(day.bySource['indeed']).toBe(2);
    expect(day.bySource['referral']).toBe(2);
    expect(day.bySource['direct']).toBe(2);
  });

  it('sortiert Timeline aufsteigend nach Tag', () => {
    const multiDayApps: KpiAppRow[] = [
      { id: 'x1', job_id: 'j1', source: 'linkedin', score_label: null, status: 'active', stage_type: null, applied_at: '2025-02-01T10:00:00.000Z' },
      { id: 'x2', job_id: 'j1', source: 'linkedin', score_label: null, status: 'active', stage_type: null, applied_at: '2025-01-15T10:00:00.000Z' },
    ];
    const input: KpiInput = {
      apps: multiDayApps,
      appsWithOutbound: new Set<string>(),
      appsWithInbound: new Set<string>(),
      firstOutboundAt: new Map(),
      appointments: [],
      botConversations: { total: 0, handedOver: 0, messagesPerApp: new Map() },
    };
    const res = computeRecruitingKpis(input, []);
    expect(res.timeline[0].day).toBe('2025-01-15');
    expect(res.timeline[1].day).toBe('2025-02-01');
  });
});

// ---------------------------------------------------------------------------
// Tests: Bot-Statistiken
// ---------------------------------------------------------------------------
describe('computeRecruitingKpis() — Bot', () => {
  const result = computeRecruitingKpis(defaultInput, knockoutReasons);

  it('berechnet abschlussquote = 5/6 (completed/withReply)', () => {
    // withReply = 6 Apps, completed (score_label!=null) = 5 Apps
    expect(result.bot.abschlussquote).toBeCloseTo(5 / 6);
  });

  it('berechnet uebergabequote = 4/10 = 0.4', () => {
    expect(result.bot.uebergabequote).toBeCloseTo(0.4);
  });

  it('berechnet avgNachrichten über Apps mit Antwort', () => {
    // Apps mit Antwort: app1(5), app2(3), app3(7), app4(2), app5(4), app6(6) → Summe=27, n=6, Avg=4.5
    expect(result.bot.avgNachrichten).toBeCloseTo(4.5);
  });

  it('gibt uebergabequote null bei total=0', () => {
    const input: KpiInput = {
      ...defaultInput,
      botConversations: { total: 0, handedOver: 0, messagesPerApp: new Map() },
    };
    const res = computeRecruitingKpis(input, []);
    expect(res.bot.uebergabequote).toBeNull();
  });

  it('topKnockouts: zählt und sortiert, max 5 Einträge', () => {
    // knockoutReasons: 'Falscher Standort'=3, 'Branche unpassend'=4, 'Zu wenig Erfahrung'=2,
    //                  'Gehaltsvorstellung zu hoch'=2, 'Keine Führungsschein'=1, 'Sonstiges'=1
    // Top-5 nach Häufigkeit (absteigend): Branche unpassend(4), Falscher Standort(3), Zu wenig Erfahrung(2), Gehaltsvorstellung zu hoch(2), ...
    expect(result.bot.topKnockouts).toHaveLength(5);
    expect(result.bot.topKnockouts[0].reason).toBe('Branche unpassend');
    expect(result.bot.topKnockouts[0].count).toBe(4);
    expect(result.bot.topKnockouts[1].reason).toBe('Falscher Standort');
    expect(result.bot.topKnockouts[1].count).toBe(3);
  });

  it('topKnockouts leer bei keinen Reasons', () => {
    const res = computeRecruitingKpis(defaultInput, []);
    expect(res.bot.topKnockouts).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: Median-Zeitberechnungen
// ---------------------------------------------------------------------------
describe('computeRecruitingKpis() — Zeitmediane', () => {
  it('berechnet medianErstkontaktSek aus firstOutboundAt − applied_at', () => {
    // app1: 3600s, app2: 7200s, app3: 1800s, app4: 5400s → sortiert: [1800,3600,5400,7200] → median=(3600+5400)/2=4500
    const result = computeRecruitingKpis(defaultInput, knockoutReasons);
    expect(result.medianErstkontaktSek).toBeCloseTo(4500);
  });

  it('medianErstkontaktSek null bei keinem Eintrag in firstOutboundAt', () => {
    const input: KpiInput = {
      ...defaultInput,
      firstOutboundAt: new Map(),
    };
    const res = computeRecruitingKpis(input, []);
    expect(res.medianErstkontaktSek).toBeNull();
  });

  it('berechnet medianTerminSek aus frühestem Termin-created_at − applied_at', () => {
    // app1 booked: created_at=BASE_DATE+86400s, applied_at=BASE_DATE → 86400s
    // app2 done:   created_at=BASE_DATE+86400s → 86400s
    // app3 no_show:created_at=BASE_DATE+86400s → 86400s
    // median([86400,86400,86400]) = 86400
    const result = computeRecruitingKpis(defaultInput, knockoutReasons);
    expect(result.medianTerminSek).toBeCloseTo(86400);
  });

  it('medianTerminSek null bei keinen gebuchten Terminen', () => {
    const input: KpiInput = { ...defaultInput, appointments: [] };
    const res = computeRecruitingKpis(input, []);
    expect(res.medianTerminSek).toBeNull();
  });
});
