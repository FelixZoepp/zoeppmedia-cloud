/**
 * Deterministisches Scoring für den KI-Vorqualifizierungsbot.
 * Phase 3 Task 4 — reine Funktion, kein I/O.
 *
 * Formel: score = Math.round(100 * Σ(weight_i × fulfillment_i) / Σ(weight_i))
 * Einbezogene Fragen: alle beantworteten + alle required (auch unbeantwortete).
 * Nicht-required unbeantwortet → aus Gewichtssumme ausgenommen.
 *
 * Label: Knockout → 'C'; sonst score ≥ a_min → 'A', ≥ b_min → 'B', sonst 'C'.
 */

import type { BotQuestion } from '@/lib/types/database';

// ---------------------------------------------------------------------------
// Öffentliche Typen
// ---------------------------------------------------------------------------

export interface AnswerForScoring {
  question_key: string;
  value: unknown;
}

export interface ScoreResult {
  /** 0–100, gerundet */
  score: number;
  label: 'A' | 'B' | 'C';
  knockout: boolean;
  reasons: Array<{
    question_key: string;
    value: unknown;
    fulfillment: number;
    knockout: boolean;
    note: string;
  }>;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/** Prüft, ob ein Datum (ISO-String) innerhalb von `months` Monaten ab heute liegt. */
function isWithinMonths(isoString: string, months: number): boolean {
  const date = new Date(isoString);
  const threshold = new Date();
  threshold.setMonth(threshold.getMonth() + months);
  return date <= threshold;
}

/** Berechnet fulfillment und knockout-Status für eine einzelne Frage. */
function evaluateQuestion(
  question: BotQuestion,
  value: unknown,
): { fulfillment: number; knockout: boolean; note: string } {
  const rule = question.knockout_rule ?? {};

  switch (question.type) {
    case 'yes_no': {
      const boolValue = Boolean(value);

      // Knockout-Prüfung: { equals: false } → Antwort false ist K.o.
      if ('equals' in rule && rule.equals === false && boolValue === false) {
        return { fulfillment: 0, knockout: true, note: 'K.o.-Kriterium nicht erfüllt' };
      }
      // Knockout-Prüfung: { equals: true } → Antwort true ist K.o.
      if ('equals' in rule && rule.equals === true && boolValue === true) {
        return { fulfillment: 0, knockout: true, note: 'K.o.-Kriterium nicht erfüllt' };
      }

      if (boolValue) {
        return { fulfillment: 1, knockout: false, note: 'erfüllt' };
      }
      return { fulfillment: 0, knockout: false, note: 'nicht erfüllt' };
    }

    case 'number': {
      const numValue = Number(value);

      // Knockout: { lt: n } → value < n ist K.o.
      if ('lt' in rule && typeof rule.lt === 'number') {
        if (numValue < (rule.lt as number)) {
          return { fulfillment: 0, knockout: true, note: 'K.o.-Kriterium nicht erfüllt' };
        }
      }

      // Abzug: { deduct_below: n } → value < n ergibt fulfillment 0.5
      if ('deduct_below' in rule && typeof rule.deduct_below === 'number') {
        if (numValue < (rule.deduct_below as number)) {
          return { fulfillment: 0.5, knockout: false, note: 'teilweise erfüllt (Abzug)' };
        }
        return { fulfillment: 1, knockout: false, note: 'erfüllt' };
      }

      // Default: fulfillment 1 wenn value ≥ min (default 0), sonst 0.5
      const min = typeof rule.min === 'number' ? (rule.min as number) : 0;
      if (numValue >= min) {
        return { fulfillment: 1, knockout: false, note: 'erfüllt' };
      }
      return { fulfillment: 0.5, knockout: false, note: 'teilweise erfüllt (Abzug)' };
    }

    case 'choice': {
      const selectedValues = Array.isArray(value) ? (value as unknown[]) : [value];
      const allowedOptions = question.options ?? [];
      const hasOverlap = selectedValues.some((v) => allowedOptions.includes(v as string));

      // Knockout: { no_overlap: true } → keine Überschneidung ist K.o.
      if (rule.no_overlap === true && !hasOverlap) {
        return { fulfillment: 0, knockout: true, note: 'K.o.-Kriterium nicht erfüllt' };
      }

      if (hasOverlap) {
        return { fulfillment: 1, knockout: false, note: 'erfüllt' };
      }
      return { fulfillment: 0, knockout: false, note: 'nicht erfüllt' };
    }

    case 'date': {
      const months =
        typeof rule.deduct_after_months === 'number'
          ? (rule.deduct_after_months as number)
          : 3;

      if (isWithinMonths(String(value), months)) {
        return { fulfillment: 1, knockout: false, note: 'erfüllt' };
      }
      return { fulfillment: 0.5, knockout: false, note: 'teilweise erfüllt (Abzug)' };
    }

    case 'text': {
      const strValue = String(value ?? '').trim();
      if (strValue.length > 0) {
        return { fulfillment: 1, knockout: false, note: 'erfüllt' };
      }
      return { fulfillment: 0, knockout: false, note: 'nicht erfüllt' };
    }

    default: {
      return { fulfillment: 0, knockout: false, note: 'nicht erfüllt' };
    }
  }
}

// ---------------------------------------------------------------------------
// Haupt-Funktion
// ---------------------------------------------------------------------------

export function computeScore(
  questions: BotQuestion[],
  answers: AnswerForScoring[],
  rules: { a_min: number; b_min: number },
): ScoreResult {
  if (questions.length === 0) {
    return { score: 0, label: 'C', knockout: false, reasons: [] };
  }

  // Antworten in eine Map überführen für schnellen Zugriff
  const answerMap = new Map<string, unknown>(
    answers.map((a) => [a.question_key, a.value]),
  );

  const reasons: ScoreResult['reasons'] = [];
  let weightedSum = 0;
  let totalWeight = 0;
  let hasKnockout = false;

  for (const question of questions) {
    const hasAnswer = answerMap.has(question.key);

    if (!hasAnswer) {
      if (question.required) {
        // Required, nicht beantwortet → fulfillment 0
        reasons.push({
          question_key: question.key,
          value: undefined,
          fulfillment: 0,
          knockout: false,
          note: 'nicht beantwortet',
        });
        weightedSum += question.weight * 0;
        totalWeight += question.weight;
      }
      // Nicht-required, nicht beantwortet → überspringen (aus Gewichtssumme ausgenommen)
      continue;
    }

    const value = answerMap.get(question.key);
    const { fulfillment, knockout, note } = evaluateQuestion(question, value);

    reasons.push({
      question_key: question.key,
      value,
      fulfillment,
      knockout,
      note,
    });

    if (knockout) {
      hasKnockout = true;
    }

    weightedSum += question.weight * fulfillment;
    totalWeight += question.weight;
  }

  // Score berechnen
  const score = totalWeight > 0 ? Math.round((100 * weightedSum) / totalWeight) : 0;

  // Label bestimmen
  let label: 'A' | 'B' | 'C';
  if (hasKnockout) {
    label = 'C';
  } else if (score >= rules.a_min) {
    label = 'A';
  } else if (score >= rules.b_min) {
    label = 'B';
  } else {
    label = 'C';
  }

  return { score, label, knockout: hasKnockout, reasons };
}
