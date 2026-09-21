/**
 * Tests für src/lib/bot/schema.ts
 * Phase 3 Task 3 — Dialog-JSON-Schema + Guardrails.
 */

import { describe, it, expect } from 'vitest';
import {
  dialogOutputSchema,
  FORBIDDEN_TOPICS,
  violatesForbiddenTopics,
  type DialogOutput,
} from '../schema';

// -------------------------------------------------------------------
// Gültiges Beispielobjekt aus Spec §8
// -------------------------------------------------------------------

const validExample: DialogOutput = {
  intent: 'answer',
  answers: [
    {
      question_key: 'fuehrerschein',
      value: true,
      confidence: 0.93,
      evidence: 'ja klasse b',
    },
  ],
  needs_clarification: false,
  reply_text: 'Super, danke! Ab wann könntest du starten?',
  handover: false,
  handover_reason: null,
};

describe('dialogOutputSchema', () => {
  it('S1: parst das gültige Beispielobjekt aus Spec §8', () => {
    const result = dialogOutputSchema.safeParse(validExample);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validExample);
    }
  });

  it('S2: ungültiger intent "foo" schlägt fehl', () => {
    const bad = { ...validExample, intent: 'foo' };
    const result = dialogOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('S3: confidence: 1.5 schlägt fehl (Range 0–1)', () => {
    const bad: DialogOutput = {
      ...validExample,
      answers: [
        { question_key: 'test', value: 'ja', confidence: 1.5, evidence: 'text' },
      ],
    };
    const result = dialogOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('S4: confidence: -0.1 schlägt fehl (unter 0)', () => {
    const bad: DialogOutput = {
      ...validExample,
      answers: [
        { question_key: 'test', value: 'ja', confidence: -0.1, evidence: 'text' },
      ],
    };
    const result = dialogOutputSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it('S5: confidence: 0 und 1 sind gültige Randwerte', () => {
    const withZero = dialogOutputSchema.safeParse({
      ...validExample,
      answers: [{ question_key: 'test', value: false, confidence: 0, evidence: '' }],
    });
    const withOne = dialogOutputSchema.safeParse({
      ...validExample,
      answers: [{ question_key: 'test', value: false, confidence: 1, evidence: '' }],
    });
    expect(withZero.success).toBe(true);
    expect(withOne.success).toBe(true);
  });

  it('S6: alle gültigen intent-Werte werden akzeptiert', () => {
    const intents = [
      'answer',
      'question',
      'off_topic',
      'stop',
      'reschedule',
      'handover_request',
      'unclear',
    ] as const;
    for (const intent of intents) {
      const result = dialogOutputSchema.safeParse({ ...validExample, intent });
      expect(result.success, `intent "${intent}" sollte gültig sein`).toBe(true);
    }
  });

  it('S7: leeres answers-Array ist gültig', () => {
    const result = dialogOutputSchema.safeParse({ ...validExample, answers: [] });
    expect(result.success).toBe(true);
  });

  it('S8: handover_reason als string ist gültig', () => {
    const result = dialogOutputSchema.safeParse({
      ...validExample,
      handover: true,
      handover_reason: 'Bewerber bittet um menschlichen Kontakt',
    });
    expect(result.success).toBe(true);
  });
});

// -------------------------------------------------------------------
// FORBIDDEN_TOPICS
// -------------------------------------------------------------------

describe('FORBIDDEN_TOPICS', () => {
  it('F1: ist ein nicht-leeres Array von Strings', () => {
    expect(Array.isArray(FORBIDDEN_TOPICS)).toBe(true);
    expect(FORBIDDEN_TOPICS.length).toBeGreaterThan(0);
    FORBIDDEN_TOPICS.forEach((t) => expect(typeof t).toBe('string'));
  });

  it('F2: alle Einträge sind klein geschrieben', () => {
    FORBIDDEN_TOPICS.forEach((t) =>
      expect(t).toBe(t.toLowerCase()),
    );
  });

  it('F3: enthält die Pflicht-Stichworte aus Spec §8', () => {
    const required = [
      'alter',
      'geburtsdatum',
      'herkunft',
      'nationalität',
      'religion',
      'gesundheit',
      'krankheit',
      'schwanger',
      'familienplanung',
      'kinderwunsch',
      'behinderung',
      'gewerkschaft',
      'sexuelle orientierung',
    ];
    for (const kw of required) {
      expect(FORBIDDEN_TOPICS, `"${kw}" fehlt in FORBIDDEN_TOPICS`).toContain(kw);
    }
  });
});

// -------------------------------------------------------------------
// violatesForbiddenTopics
// -------------------------------------------------------------------

describe('violatesForbiddenTopics', () => {
  it('V1: "Wie alt bist du?" → true (Stichwort "alt bist")', () => {
    expect(violatesForbiddenTopics('Wie alt bist du?')).toBe(true);
  });

  it('V2: "Hast du einen Führerschein?" → false', () => {
    expect(violatesForbiddenTopics('Hast du einen Führerschein?')).toBe(false);
  });

  it('V3: case-insensitiv — "ALT BIST" findet Treffer', () => {
    expect(violatesForbiddenTopics('Bitte sag mir, ALT BIST du?')).toBe(true);
  });

  it('V4: "Wie ist dein Geburtsdatum?" → true', () => {
    expect(violatesForbiddenTopics('Wie ist dein Geburtsdatum?')).toBe(true);
  });

  it('V5: "Bist du schwanger?" → true', () => {
    expect(violatesForbiddenTopics('Bist du schwanger?')).toBe(true);
  });

  it('V6: "Hast du Erfahrung im Vertrieb?" → false', () => {
    expect(violatesForbiddenTopics('Hast du Erfahrung im Vertrieb?')).toBe(false);
  });

  it('V7: leerer String → false', () => {
    expect(violatesForbiddenTopics('')).toBe(false);
  });

  it('V8: "nationalität" als Substring → true', () => {
    expect(violatesForbiddenTopics('Was ist deine Nationalität?')).toBe(true);
  });
});
