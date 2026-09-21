/**
 * Strukturtest für EVAL_DIALOGS-Fixtures.
 * Phase 3 Task 12 — Guardrail-Gate (deterministisch, kein Netz nötig).
 *
 * Prüft:
 * - >= 50 Dialoge je Preset
 * - Alle 6 Kategorien je Preset vertreten
 * - Jeder questionKey existiert im jeweiligen Preset
 * - Keine userMessage leer
 * - Namen eindeutig (global)
 */

import { describe, it, expect } from 'vitest';
import { EVAL_DIALOGS, type EvalDialog } from '../__fixtures__/eval-dialogs';
import { BOT_PRESETS } from '../presets';

const PRESETS = ['pflege', 'logistik', 'handwerk', 'gastro', 'vertrieb'] as const;
const CATEGORIES: EvalDialog['category'][] = [
  'klar',
  'dialekt',
  'tippfehler',
  'gegenfrage',
  'abbruch',
  'provokation',
];

describe('EVAL_DIALOGS Strukturtest', () => {
  it('exportiert ein Array', () => {
    expect(Array.isArray(EVAL_DIALOGS)).toBe(true);
  });

  it('enthält mindestens 250 Einträge gesamt', () => {
    expect(EVAL_DIALOGS.length).toBeGreaterThanOrEqual(250);
  });

  it('enthält mindestens 50 Dialoge je Preset', () => {
    for (const preset of PRESETS) {
      const count = EVAL_DIALOGS.filter((d) => d.preset === preset).length;
      expect(count, `Preset "${preset}" hat nur ${count} Dialoge`).toBeGreaterThanOrEqual(50);
    }
  });

  it('alle 6 Kategorien je Preset vertreten', () => {
    for (const preset of PRESETS) {
      const dialogs = EVAL_DIALOGS.filter((d) => d.preset === preset);
      for (const cat of CATEGORIES) {
        const count = dialogs.filter((d) => d.category === cat).length;
        expect(count, `Preset "${preset}" fehlt Kategorie "${cat}"`).toBeGreaterThan(0);
      }
    }
  });

  it('jeder questionKey existiert im jeweiligen Preset', () => {
    const presetKeys: Record<string, Set<string>> = {};
    for (const preset of BOT_PRESETS) {
      presetKeys[preset.key] = new Set(preset.questions.map((q) => q.key));
    }

    for (const dialog of EVAL_DIALOGS) {
      const validKeys = presetKeys[dialog.preset];
      expect(
        validKeys?.has(dialog.questionKey),
        `Preset "${dialog.preset}": questionKey "${dialog.questionKey}" unbekannt`,
      ).toBe(true);
    }
  });

  it('keine userMessage ist leer', () => {
    for (const dialog of EVAL_DIALOGS) {
      expect(
        dialog.userMessage.trim().length,
        `Dialog "${dialog.name}" hat leere userMessage`,
      ).toBeGreaterThan(0);
    }
  });

  it('Namen sind global eindeutig', () => {
    const names = EVAL_DIALOGS.map((d) => d.name);
    const unique = new Set(names);
    expect(unique.size, `${names.length - unique.size} doppelte Namen gefunden`).toBe(names.length);
  });
});
