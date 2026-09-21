/**
 * Tests für src/lib/bot/presets.ts
 * Phase 3 Task 5 — Branchen-Presets.
 */

import { describe, it, expect } from 'vitest';
import { BOT_PRESETS, type BotPreset } from '../presets';
import { violatesForbiddenTopics } from '../schema';

// ---------------------------------------------------------------------------
// P1: Grundstruktur — genau 5 Presets mit den korrekten Keys
// ---------------------------------------------------------------------------

describe('BOT_PRESETS – Grundstruktur', () => {
  it('P1: BOT_PRESETS hat genau 5 Einträge', () => {
    expect(BOT_PRESETS).toHaveLength(5);
  });

  it('P2: alle 5 Branchen-Keys pflege/logistik/handwerk/gastro/vertrieb vorhanden', () => {
    const keys = BOT_PRESETS.map((p) => p.key);
    expect(keys).toContain('pflege');
    expect(keys).toContain('logistik');
    expect(keys).toContain('handwerk');
    expect(keys).toContain('gastro');
    expect(keys).toContain('vertrieb');
  });

  it('P3: kein Preset-Key doppelt', () => {
    const keys = BOT_PRESETS.map((p) => p.key);
    const unique = new Set(keys);
    expect(unique.size).toBe(5);
  });

  it('P4: jedes Preset hat einen nicht-leeren name', () => {
    for (const preset of BOT_PRESETS) {
      expect(typeof preset.name).toBe('string');
      expect(preset.name.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// P2: config-Felder
// ---------------------------------------------------------------------------

describe('BOT_PRESETS – config-Felder', () => {
  it('P5: alle Presets haben formality "du"', () => {
    for (const preset of BOT_PRESETS) {
      expect(preset.config.formality).toBe('du');
    }
  });

  it('P6: alle Presets haben einen non-empty persona-String', () => {
    for (const preset of BOT_PRESETS) {
      expect(typeof preset.config.persona).toBe('string');
      expect(preset.config.persona.length).toBeGreaterThan(0);
    }
  });

  it('P7: alle Presets haben einen non-empty tone-String', () => {
    for (const preset of BOT_PRESETS) {
      expect(typeof preset.config.tone).toBe('string');
      expect(preset.config.tone.length).toBeGreaterThan(0);
    }
  });

  it('P8: alle Presets haben einen non-empty intro_text', () => {
    for (const preset of BOT_PRESETS) {
      expect(typeof preset.config.intro_text).toBe('string');
      expect(preset.config.intro_text.length).toBeGreaterThan(0);
    }
  });

  it('P9: alle Presets haben mindestens 2 FAQ-Einträge', () => {
    for (const preset of BOT_PRESETS) {
      expect(Array.isArray(preset.config.faq)).toBe(true);
      expect(preset.config.faq.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('P10: alle FAQ-Einträge haben q und a als non-empty Strings', () => {
    for (const preset of BOT_PRESETS) {
      for (const entry of preset.config.faq) {
        expect(typeof entry.q).toBe('string');
        expect(entry.q.length).toBeGreaterThan(0);
        expect(typeof entry.a).toBe('string');
        expect(entry.a.length).toBeGreaterThan(0);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// P3: questions-Array
// ---------------------------------------------------------------------------

describe('BOT_PRESETS – questions', () => {
  it('P11: jedes Preset hat zwischen 4 und 6 Fragen', () => {
    for (const preset of BOT_PRESETS) {
      expect(preset.questions.length).toBeGreaterThanOrEqual(4);
      expect(preset.questions.length).toBeLessThanOrEqual(6);
    }
  });

  it('P12: Frage-Keys je Preset eindeutig', () => {
    for (const preset of BOT_PRESETS) {
      const qKeys = preset.questions.map((q) => q.key);
      const unique = new Set(qKeys);
      expect(unique.size).toBe(qKeys.length);
    }
  });

  it('P13: jedes Preset hat mindestens 1 Knockout-Frage', () => {
    for (const preset of BOT_PRESETS) {
      const hasKnockout = preset.questions.some(
        (q) => q.knockout_rule !== undefined && q.knockout_rule !== null,
      );
      expect(hasKnockout, `Preset "${preset.key}" hat keine Knockout-Frage`).toBe(true);
    }
  });

  it('P14: alle Frage-weight-Werte sind positive Zahlen', () => {
    for (const preset of BOT_PRESETS) {
      for (const q of preset.questions) {
        expect(typeof q.weight).toBe('number');
        expect(q.weight).toBeGreaterThan(0);
      }
    }
  });

  it('P15: alle Frage-type-Werte sind gültige BotQuestionType-Werte', () => {
    const validTypes = ['text', 'number', 'choice', 'yes_no', 'date'] as const;
    for (const preset of BOT_PRESETS) {
      for (const q of preset.questions) {
        expect(validTypes).toContain(q.type);
      }
    }
  });

  it('P16: choice-Fragen haben ein nicht-leeres options-Array', () => {
    for (const preset of BOT_PRESETS) {
      for (const q of preset.questions) {
        if (q.type === 'choice') {
          expect(Array.isArray(q.options)).toBe(true);
          expect(q.options!.length).toBeGreaterThan(0);
        }
      }
    }
  });
});

// ---------------------------------------------------------------------------
// P4: Guardrail-Test (zentraler Sicherheitstest — Task 3 violatesForbiddenTopics)
// ---------------------------------------------------------------------------

describe('BOT_PRESETS – Guardrail-Test (verbotene Themen)', () => {
  it('P17: kein Fragetext verletzt violatesForbiddenTopics', () => {
    for (const preset of BOT_PRESETS) {
      for (const q of preset.questions) {
        expect(
          violatesForbiddenTopics(q.text),
          `Preset "${preset.key}", Frage "${q.key}" — text verletzt Guardrail: "${q.text}"`,
        ).toBe(false);
      }
    }
  });

  it('P18: kein FAQ-Fragetext verletzt violatesForbiddenTopics', () => {
    for (const preset of BOT_PRESETS) {
      for (const entry of preset.config.faq) {
        expect(
          violatesForbiddenTopics(entry.q),
          `Preset "${preset.key}" FAQ q verletzt Guardrail: "${entry.q}"`,
        ).toBe(false);
        expect(
          violatesForbiddenTopics(entry.a),
          `Preset "${preset.key}" FAQ a verletzt Guardrail: "${entry.a}"`,
        ).toBe(false);
      }
    }
  });

  it('P19: kein intro_text verletzt violatesForbiddenTopics', () => {
    for (const preset of BOT_PRESETS) {
      expect(
        violatesForbiddenTopics(preset.config.intro_text),
        `Preset "${preset.key}" intro_text verletzt Guardrail`,
      ).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// P5: Branchenspezifische Pflichtfragen
// ---------------------------------------------------------------------------

describe('BOT_PRESETS – branchenspezifische Pflichtfragen', () => {
  it('P20: Vertrieb hat Frage fuehrerschein (yes_no, Knockout)', () => {
    const vertrieb = BOT_PRESETS.find((p) => p.key === 'vertrieb')!;
    const frage = vertrieb.questions.find((q) => q.key === 'fuehrerschein');
    expect(frage).toBeDefined();
    expect(frage!.type).toBe('yes_no');
    expect(frage!.knockout_rule).toBeDefined();
  });

  it('P21: Pflege hat Knockout-Frage ausbildung_pflege (yes_no)', () => {
    const pflege = BOT_PRESETS.find((p) => p.key === 'pflege')!;
    const frage = pflege.questions.find((q) => q.key === 'ausbildung_pflege');
    expect(frage).toBeDefined();
    expect(frage!.type).toBe('yes_no');
    expect(frage!.knockout_rule).toBeDefined();
  });

  it('P22: Logistik hat Knockout-Frage staplerschein (yes_no)', () => {
    const logistik = BOT_PRESETS.find((p) => p.key === 'logistik')!;
    const frage = logistik.questions.find((q) => q.key === 'staplerschein');
    expect(frage).toBeDefined();
    expect(frage!.type).toBe('yes_no');
    expect(frage!.knockout_rule).toBeDefined();
  });

  it('P23: Handwerk hat Knockout-Frage gesellenbrief (yes_no)', () => {
    const handwerk = BOT_PRESETS.find((p) => p.key === 'handwerk')!;
    const frage = handwerk.questions.find((q) => q.key === 'gesellenbrief');
    expect(frage).toBeDefined();
    expect(frage!.type).toBe('yes_no');
    expect(frage!.knockout_rule).toBeDefined();
  });

  it('P24: Gastro hat Frage wochenende (choice)', () => {
    const gastro = BOT_PRESETS.find((p) => p.key === 'gastro')!;
    const frage = gastro.questions.find((q) => q.key === 'wochenende');
    expect(frage).toBeDefined();
    expect(frage!.type).toBe('choice');
  });
});

// ---------------------------------------------------------------------------
// P6: TypeScript-Typ BotPreset exportiert
// ---------------------------------------------------------------------------

describe('BotPreset – TypeScript-Typ', () => {
  it('P25: BotPreset-Typ kann importiert und als Annotation genutzt werden', () => {
    const preset: BotPreset = BOT_PRESETS[0];
    expect(preset).toBeDefined();
    expect(typeof preset.key).toBe('string');
  });
});
