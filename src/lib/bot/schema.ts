/**
 * Dialog-JSON-Schema + Guardrail-Hilfsfunktionen.
 * Phase 3 Task 3.
 */

import { z } from 'zod';

// -------------------------------------------------------------------
// DialogOutput — Zod-Schema und TypeScript-Interface
// -------------------------------------------------------------------

export interface DialogOutput {
  intent: 'answer' | 'question' | 'off_topic' | 'stop' | 'reschedule' | 'handover_request' | 'unclear';
  answers: Array<{
    question_key: string;
    value: unknown;
    confidence: number;
    evidence: string;
  }>;
  needs_clarification: boolean;
  reply_text: string;
  handover: boolean;
  handover_reason: string | null;
}

export const dialogOutputSchema: z.ZodType<DialogOutput> = z.object({
  intent: z.enum([
    'answer',
    'question',
    'off_topic',
    'stop',
    'reschedule',
    'handover_request',
    'unclear',
  ]),
  answers: z.array(
    z.object({
      question_key: z.string(),
      value: z.unknown(),
      confidence: z.number().min(0).max(1),
      evidence: z.string(),
    }),
  ),
  needs_clarification: z.boolean(),
  reply_text: z.string(),
  handover: z.boolean(),
  handover_reason: z.string().nullable(),
});

// -------------------------------------------------------------------
// Verbotene Themen (Blockliste, Spec §8 Guardrails)
// -------------------------------------------------------------------

export const FORBIDDEN_TOPICS: string[] = [
  'alter',
  'alt bist',
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

/**
 * Prüft, ob ein Text ein verbotenes Thema enthält (case-insensitiv, Substring-Match).
 */
export function violatesForbiddenTopics(text: string): boolean {
  const lower = text.toLowerCase();
  return FORBIDDEN_TOPICS.some((topic) => lower.includes(topic));
}
