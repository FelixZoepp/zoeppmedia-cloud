/**
 * Tests für src/lib/bot/scoring.ts
 * Phase 3 Task 4 — Deterministisches Scoring mit Knockout und Gewichten.
 *
 * TDD: Failing tests FIRST, dann Implementierung.
 */

import { describe, it, expect } from 'vitest';
import {
  computeScore,
  type AnswerForScoring,
  type ScoreResult,
} from '../scoring';
import type { BotQuestion } from '@/lib/types/database';

// ---------------------------------------------------------------------------
// Hilfsfunktion: minimale BotQuestion mit sinnvollen Defaults
// ---------------------------------------------------------------------------
function makeQ(overrides: Partial<BotQuestion> & { key: string; type: BotQuestion['type']; weight: number }): BotQuestion {
  return {
    id: `q-${overrides.key}`,
    agency_id: 'agency-1',
    bot_config_id: 'cfg-1',
    position: 1,
    text: `Frage ${overrides.key}`,
    options: null,
    required: true,
    knockout_rule: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const defaultRules = { a_min: 80, b_min: 50 };

// ---------------------------------------------------------------------------
// S1: yes_no
// ---------------------------------------------------------------------------
describe('Scoring: yes_no', () => {
  it('S1a: yes_no true → fulfillment 1, note "erfüllt", kein Knockout', () => {
    const q = makeQ({ key: 'fuehrerschein', type: 'yes_no', weight: 1 });
    const answers: AnswerForScoring[] = [{ question_key: 'fuehrerschein', value: true }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.score).toBe(100);
    expect(result.label).toBe('A');
    expect(result.knockout).toBe(false);
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0].fulfillment).toBe(1);
    expect(result.reasons[0].knockout).toBe(false);
    expect(result.reasons[0].note).toBe('erfüllt');
  });

  it('S1b: yes_no false ohne knockout_rule → fulfillment 0, note "nicht erfüllt"', () => {
    const q = makeQ({ key: 'fuehrerschein', type: 'yes_no', weight: 1 });
    const answers: AnswerForScoring[] = [{ question_key: 'fuehrerschein', value: false }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.score).toBe(0);
    expect(result.knockout).toBe(false);
    expect(result.reasons[0].fulfillment).toBe(0);
    expect(result.reasons[0].note).toBe('nicht erfüllt');
  });

  it('S1c: yes_no mit knockout_rule { equals: false } und value false → Knockout, label C', () => {
    const q = makeQ({
      key: 'volljährig',
      type: 'yes_no',
      weight: 5,
      knockout_rule: { equals: false },
    });
    const answers: AnswerForScoring[] = [{ question_key: 'volljährig', value: false }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.knockout).toBe(true);
    expect(result.label).toBe('C');
    expect(result.reasons[0].knockout).toBe(true);
    expect(result.reasons[0].note).toBe('K.o.-Kriterium nicht erfüllt');
  });

  it('S1d: yes_no mit knockout_rule { equals: false } und value true → KEIN Knockout', () => {
    const q = makeQ({
      key: 'volljährig',
      type: 'yes_no',
      weight: 1,
      knockout_rule: { equals: false },
    });
    const answers: AnswerForScoring[] = [{ question_key: 'volljährig', value: true }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.knockout).toBe(false);
    expect(result.reasons[0].knockout).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S2: number
// ---------------------------------------------------------------------------
describe('Scoring: number', () => {
  it('S2a: knockout_rule { lt: 1 } mit value 0 → Knockout', () => {
    const q = makeQ({
      key: 'erfahrung',
      type: 'number',
      weight: 2,
      knockout_rule: { lt: 1 },
    });
    const answers: AnswerForScoring[] = [{ question_key: 'erfahrung', value: 0 }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.knockout).toBe(true);
    expect(result.label).toBe('C');
    expect(result.reasons[0].knockout).toBe(true);
    expect(result.reasons[0].note).toBe('K.o.-Kriterium nicht erfüllt');
  });

  it('S2b: knockout_rule { lt: 1 } mit value 1 → kein Knockout, fulfillment 1', () => {
    const q = makeQ({
      key: 'erfahrung',
      type: 'number',
      weight: 1,
      knockout_rule: { lt: 1 },
    });
    const answers: AnswerForScoring[] = [{ question_key: 'erfahrung', value: 1 }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.knockout).toBe(false);
    expect(result.reasons[0].fulfillment).toBe(1);
  });

  it('S2c: knockout_rule { deduct_below: 2 } mit value 1 → fulfillment 0.5, Abzug', () => {
    const q = makeQ({
      key: 'erfahrung',
      type: 'number',
      weight: 2,
      knockout_rule: { deduct_below: 2 },
    });
    const answers: AnswerForScoring[] = [{ question_key: 'erfahrung', value: 1 }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.knockout).toBe(false);
    expect(result.reasons[0].fulfillment).toBe(0.5);
    expect(result.reasons[0].note).toBe('teilweise erfüllt (Abzug)');
  });

  it('S2d: keine knockout_rule, value ≥ 0 (default min=0) → fulfillment 1', () => {
    const q = makeQ({ key: 'alter', type: 'number', weight: 1 });
    const answers: AnswerForScoring[] = [{ question_key: 'alter', value: 25 }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.reasons[0].fulfillment).toBe(1);
    expect(result.knockout).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// S3: choice
// ---------------------------------------------------------------------------
describe('Scoring: choice', () => {
  it('S3a: Überschneidung ≥ 1 → fulfillment 1, note "erfüllt"', () => {
    const q = makeQ({
      key: 'region',
      type: 'choice',
      weight: 1,
      options: ['Berlin', 'Hamburg', 'München'],
    });
    const answers: AnswerForScoring[] = [{ question_key: 'region', value: ['Berlin'] }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.reasons[0].fulfillment).toBe(1);
    expect(result.reasons[0].note).toBe('erfüllt');
    expect(result.knockout).toBe(false);
  });

  it('S3b: keine Überschneidung ohne knockout_rule → fulfillment 0, note "nicht erfüllt"', () => {
    const q = makeQ({
      key: 'region',
      type: 'choice',
      weight: 1,
      options: ['Berlin', 'Hamburg'],
    });
    const answers: AnswerForScoring[] = [{ question_key: 'region', value: ['München'] }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.reasons[0].fulfillment).toBe(0);
    expect(result.reasons[0].note).toBe('nicht erfüllt');
    expect(result.knockout).toBe(false);
  });

  it('S3c: keine Überschneidung mit knockout_rule { no_overlap: true } → Knockout', () => {
    const q = makeQ({
      key: 'region',
      type: 'choice',
      weight: 3,
      options: ['Berlin', 'Hamburg'],
      knockout_rule: { no_overlap: true },
    });
    const answers: AnswerForScoring[] = [{ question_key: 'region', value: ['München'] }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.knockout).toBe(true);
    expect(result.label).toBe('C');
    expect(result.reasons[0].knockout).toBe(true);
    expect(result.reasons[0].note).toBe('K.o.-Kriterium nicht erfüllt');
  });

  it('S3d: Überschneidung mit knockout_rule { no_overlap: true } → KEIN Knockout', () => {
    const q = makeQ({
      key: 'region',
      type: 'choice',
      weight: 1,
      options: ['Berlin', 'Hamburg'],
      knockout_rule: { no_overlap: true },
    });
    const answers: AnswerForScoring[] = [{ question_key: 'region', value: ['Berlin', 'München'] }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.knockout).toBe(false);
    expect(result.reasons[0].fulfillment).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// S4: date
// ---------------------------------------------------------------------------
describe('Scoring: date', () => {
  it('S4a: Datum ≤ 3 Monate ab heute → fulfillment 1', () => {
    const soon = new Date();
    soon.setMonth(soon.getMonth() + 2);
    const q = makeQ({
      key: 'startdatum',
      type: 'date',
      weight: 1,
      knockout_rule: { deduct_after_months: 3 },
    });
    const answers: AnswerForScoring[] = [{ question_key: 'startdatum', value: soon.toISOString() }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.reasons[0].fulfillment).toBe(1);
    expect(result.reasons[0].note).toBe('erfüllt');
  });

  it('S4b: Datum > 3 Monate ab heute → fulfillment 0.5 (Abzug)', () => {
    const later = new Date();
    later.setMonth(later.getMonth() + 5);
    const q = makeQ({
      key: 'startdatum',
      type: 'date',
      weight: 1,
      knockout_rule: { deduct_after_months: 3 },
    });
    const answers: AnswerForScoring[] = [{ question_key: 'startdatum', value: later.toISOString() }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.reasons[0].fulfillment).toBe(0.5);
    expect(result.reasons[0].note).toBe('teilweise erfüllt (Abzug)');
  });

  it('S4c: date ohne knockout_rule → Default 3 Monate Schwelle gilt', () => {
    const later = new Date();
    later.setMonth(later.getMonth() + 4);
    const q = makeQ({ key: 'startdatum', type: 'date', weight: 1 });
    const answers: AnswerForScoring[] = [{ question_key: 'startdatum', value: later.toISOString() }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.reasons[0].fulfillment).toBe(0.5);
  });
});

// ---------------------------------------------------------------------------
// S5: text
// ---------------------------------------------------------------------------
describe('Scoring: text', () => {
  it('S5a: nicht-leerer String → fulfillment 1, note "erfüllt"', () => {
    const q = makeQ({ key: 'motivation', type: 'text', weight: 1 });
    const answers: AnswerForScoring[] = [{ question_key: 'motivation', value: 'Ich bin motiviert' }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.reasons[0].fulfillment).toBe(1);
    expect(result.reasons[0].note).toBe('erfüllt');
  });

  it('S5b: leerer String → fulfillment 0, note "nicht erfüllt"', () => {
    const q = makeQ({ key: 'motivation', type: 'text', weight: 1 });
    const answers: AnswerForScoring[] = [{ question_key: 'motivation', value: '' }];
    const result = computeScore([q], answers, defaultRules);

    expect(result.reasons[0].fulfillment).toBe(0);
    expect(result.reasons[0].note).toBe('nicht erfüllt');
  });
});

// ---------------------------------------------------------------------------
// S6: Gewichtung und Skala
// ---------------------------------------------------------------------------
describe('Scoring: Gewichtung und Skala', () => {
  it('S6a: 2 Fragen weight 3 und 1, fulfillment 1 und 0 → score 75', () => {
    const q1 = makeQ({ key: 'q1', type: 'yes_no', weight: 3 });
    const q2 = makeQ({ key: 'q2', type: 'yes_no', weight: 1 });
    const answers: AnswerForScoring[] = [
      { question_key: 'q1', value: true },
      { question_key: 'q2', value: false },
    ];
    const result = computeScore([q1, q2], answers, defaultRules);

    // score = round(100 * (3*1 + 1*0) / (3+1)) = round(75) = 75
    expect(result.score).toBe(75);
  });

  it('S6b: score 75 mit a_min=75 → label A', () => {
    const q1 = makeQ({ key: 'q1', type: 'yes_no', weight: 3 });
    const q2 = makeQ({ key: 'q2', type: 'yes_no', weight: 1 });
    const answers: AnswerForScoring[] = [
      { question_key: 'q1', value: true },
      { question_key: 'q2', value: false },
    ];
    const result = computeScore([q1, q2], answers, { a_min: 75, b_min: 50 });
    expect(result.label).toBe('A');
  });

  it('S6c: score 75 mit a_min=80, b_min=50 → label B', () => {
    const q1 = makeQ({ key: 'q1', type: 'yes_no', weight: 3 });
    const q2 = makeQ({ key: 'q2', type: 'yes_no', weight: 1 });
    const answers: AnswerForScoring[] = [
      { question_key: 'q1', value: true },
      { question_key: 'q2', value: false },
    ];
    const result = computeScore([q1, q2], answers, { a_min: 80, b_min: 50 });
    expect(result.label).toBe('B');
  });

  it('S6d: score 49 mit b_min=50 → label C', () => {
    // 2 Fragen weight 1, fulfillment 0 und 0 → score 0... stattdessen gezielt konstruieren
    // weight 1 +1, fulfillment 0 und 1 → score 50, zu hoch
    // 3 Fragen: weight 1 jede, fulfillment 1 + 0 + 0 → score 33
    // Besser: 2 Fragen weight 50 und 51: fulfillment 1 + 0 → score round(100*50/101) = round(49.5) = 50
    // Wir wollen 49 exakt: z.B. weight 49 und 51, fulfillment 1 und 0 → score round(100*49/100)=49
    const q1 = makeQ({ key: 'q1', type: 'yes_no', weight: 49 });
    const q2 = makeQ({ key: 'q2', type: 'yes_no', weight: 51 });
    const answers: AnswerForScoring[] = [
      { question_key: 'q1', value: true },
      { question_key: 'q2', value: false },
    ];
    const result = computeScore([q1, q2], answers, { a_min: 80, b_min: 50 });
    expect(result.score).toBe(49);
    expect(result.label).toBe('C');
  });
});

// ---------------------------------------------------------------------------
// S7: Unbeantwortete Fragen
// ---------------------------------------------------------------------------
describe('Scoring: Unbeantwortete Fragen', () => {
  it('S7a: required Frage ohne Antwort → fulfillment 0, note "nicht beantwortet"', () => {
    const q = makeQ({ key: 'pflicht', type: 'text', weight: 2, required: true });
    const result = computeScore([q], [], defaultRules);

    expect(result.score).toBe(0);
    expect(result.reasons[0].fulfillment).toBe(0);
    expect(result.reasons[0].note).toBe('nicht beantwortet');
  });

  it('S7b: nicht-required Frage ohne Antwort → aus Gewichtssumme ausgenommen', () => {
    const qRequired = makeQ({ key: 'pflicht', type: 'yes_no', weight: 1, required: true });
    const qOptional = makeQ({ key: 'optional', type: 'text', weight: 100, required: false });
    const answers: AnswerForScoring[] = [{ question_key: 'pflicht', value: true }];
    const result = computeScore([qRequired, qOptional], answers, defaultRules);

    // Nur qRequired zählt (weight 1, fulfillment 1) → score 100
    expect(result.score).toBe(100);
    // optional erscheint nicht in reasons (da nicht beantwortet + nicht required)
    expect(result.reasons).toHaveLength(1);
    expect(result.reasons[0].question_key).toBe('pflicht');
  });

  it('S7c: nur nicht-required Fragen, alle unbeantwortet → score 0, reasons []', () => {
    const q = makeQ({ key: 'optional', type: 'text', weight: 5, required: false });
    const result = computeScore([q], [], defaultRules);

    expect(result.score).toBe(0);
    expect(result.label).toBe('C');
    expect(result.reasons).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// S8: Leere Fragenliste
// ---------------------------------------------------------------------------
describe('Scoring: Leere Fragenliste', () => {
  it('S8: leere Fragenliste → score 0, label C, reasons []', () => {
    const result = computeScore([], [], defaultRules);

    expect(result.score).toBe(0);
    expect(result.label).toBe('C');
    expect(result.knockout).toBe(false);
    expect(result.reasons).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// S9: ScoreResult-Struktur (Typencheck zur Laufzeit)
// ---------------------------------------------------------------------------
describe('Scoring: ScoreResult Struktur', () => {
  it('S9: ScoreResult enthält alle erwarteten Felder', () => {
    const q = makeQ({ key: 'test', type: 'yes_no', weight: 1 });
    const result: ScoreResult = computeScore([q], [{ question_key: 'test', value: true }], defaultRules);

    expect(typeof result.score).toBe('number');
    expect(['A', 'B', 'C']).toContain(result.label);
    expect(typeof result.knockout).toBe('boolean');
    expect(Array.isArray(result.reasons)).toBe(true);
    if (result.reasons.length > 0) {
      const r = result.reasons[0];
      expect(typeof r.question_key).toBe('string');
      expect(typeof r.fulfillment).toBe('number');
      expect(typeof r.knockout).toBe('boolean');
      expect(typeof r.note).toBe('string');
    }
  });
});

// ---------------------------------------------------------------------------
// S10: Knockout überschreibt Label immer
// ---------------------------------------------------------------------------
describe('Scoring: Knockout überschreibt Label', () => {
  it('S10: Knockout bei hohem Score → label immer C', () => {
    // Frage 1: weight 100, yes_no, erfüllt → hoher Score
    // Frage 2: weight 1, knockout, nicht erfüllt → Knockout
    const qHigh = makeQ({ key: 'hoch', type: 'yes_no', weight: 100 });
    const qKo = makeQ({
      key: 'ko',
      type: 'yes_no',
      weight: 1,
      knockout_rule: { equals: false },
    });
    const answers: AnswerForScoring[] = [
      { question_key: 'hoch', value: true },
      { question_key: 'ko', value: false },
    ];
    const result = computeScore([qHigh, qKo], answers, { a_min: 50, b_min: 30 });

    expect(result.knockout).toBe(true);
    expect(result.label).toBe('C');
  });
});
