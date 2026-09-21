/**
 * =============================================================================
 * bot-eval.ts — Live-Eval-Script für den KI-Vorqualifizierungsbot
 * Phase 3 Task 12
 * =============================================================================
 *
 * Verwendung:
 *   ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/bot-eval.ts
 *
 * Voraussetzungen:
 *   - ANTHROPIC_API_KEY muss gesetzt sein (bricht sonst sofort mit Hinweis ab)
 *   - Kein Supabase, keine DB — reines Offline-Eval gegen das Anthropic-SDK
 *
 * CI-Abnahme (Spec §8 QS):
 *   - Exit-Code 0 wenn Trefferquote >= 95 %
 *   - Exit-Code 1 wenn Trefferquote < 95 %
 *   Das Script wird im CI nur mit gesetztem ANTHROPIC_API_KEY ausgeführt.
 *   In der normalen Entwicklung ohne Key: bricht mit Hinweis ab (Exit 1).
 *
 * Parallelität: max 5 gleichzeitige API-Aufrufe (Rate-Limit-Schutz).
 * =============================================================================
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { EVAL_DIALOGS, type EvalDialog } from '../src/lib/bot/__fixtures__/eval-dialogs';
import { BOT_PRESETS } from '../src/lib/bot/presets';
import { buildSystemBlocks, type PromptContext } from '../src/lib/bot/prompt';
import { dialogOutputSchema, type DialogOutput } from '../src/lib/bot/schema';
import { DIALOG_MODEL } from '../src/lib/ai/llm-client';

// ---------------------------------------------------------------------------
// Konfiguration
// ---------------------------------------------------------------------------

const CONCURRENCY = 5;
const PASS_THRESHOLD = 0.95;
const MAX_TOKENS = 512;

// ---------------------------------------------------------------------------
// API-Key-Check — sofortiger Abbruch mit Hinweis
// ---------------------------------------------------------------------------

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('');
  console.error('FEHLER: ANTHROPIC_API_KEY ist nicht gesetzt.');
  console.error('');
  console.error('Setze die Variable und starte erneut:');
  console.error('  ANTHROPIC_API_KEY=sk-ant-... npx tsx scripts/bot-eval.ts');
  console.error('');
  console.error('Hinweis: Dieses Script führt echte API-Aufrufe durch und');
  console.error('verursacht Kosten. Nur im Rahmen der CI-Abnahme ausführen.');
  console.error('');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Mini-SDK-Wrapper (kein Supabase, kein DB-Logging)
// ---------------------------------------------------------------------------

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extractJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    // ignorieren
  }
  const match = text.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      return JSON.parse(match[0]);
    } catch {
      // ignorieren
    }
  }
  return undefined;
}

async function llmJsonCallDirect<T>(
  system: Array<{ type: 'text'; text: string }>,
  userMessage: string,
  schema: z.ZodType<T>,
): Promise<T> {
  const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: userMessage },
  ];

  const response = await client.messages.create({
    model: DIALOG_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages,
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const rawText = textBlock && 'text' in textBlock ? textBlock.text : '';
  const parsed = extractJson(rawText);
  const validated = parsed !== undefined ? schema.safeParse(parsed) : { success: false as const };

  if (validated.success) {
    return (validated as { success: true; data: T }).data;
  }

  // Retry mit Hinweis
  const retryMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    { role: 'user', content: userMessage },
    { role: 'assistant', content: rawText },
    {
      role: 'user',
      content: 'Antworte ausschließlich mit gültigem JSON nach dem vorgegebenen Schema.',
    },
  ];

  const retryResponse = await client.messages.create({
    model: DIALOG_MODEL,
    max_tokens: MAX_TOKENS,
    system,
    messages: retryMessages,
  });

  const retryTextBlock = retryResponse.content.find((b) => b.type === 'text');
  const retryRawText = retryTextBlock && 'text' in retryTextBlock ? retryTextBlock.text : '';
  const retryParsed = extractJson(retryRawText);
  const retryValidated =
    retryParsed !== undefined ? schema.safeParse(retryParsed) : { success: false as const };

  if (retryValidated.success) {
    return (retryValidated as { success: true; data: T }).data;
  }

  throw new Error('KI-Antwort nach Retry ungültig');
}

// ---------------------------------------------------------------------------
// PromptContext aus Preset + questionKey aufbauen
// ---------------------------------------------------------------------------

function buildContextForDialog(dialog: EvalDialog): PromptContext {
  const preset = BOT_PRESETS.find((p) => p.key === dialog.preset);
  if (!preset) throw new Error(`Unbekanntes Preset: ${dialog.preset}`);

  return {
    agencyName: 'Zoepp Media Cloud',
    job: {
      title: preset.name,
      description: null,
      location: null,
    },
    config: {
      persona: preset.config.persona,
      tone: preset.config.tone,
      formality: preset.config.formality,
      language: 'Deutsch',
      allowed_languages: ['Deutsch'],
      faq: preset.config.faq,
      intro_text: preset.config.intro_text,
    },
    questions: preset.questions.map((q) => ({
      key: q.key,
      text: q.text,
      type: q.type,
      options: q.options ?? null,
      required: q.required,
      status: q.key === dialog.questionKey ? ('offen' as const) : ('beantwortet' as const),
    })),
    currentQuestionKey: dialog.questionKey,
  };
}

// ---------------------------------------------------------------------------
// Vergleichslogik
// ---------------------------------------------------------------------------

function normalizeValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  return String(v).toLowerCase().trim();
}

function arraysEqualAsSet(a: unknown[], b: unknown[]): boolean {
  const setA = new Set(a.map(normalizeValue));
  const setB = new Set(b.map(normalizeValue));
  if (setA.size !== setB.size) return false;
  for (const item of setA) {
    if (!setB.has(item)) return false;
  }
  return true;
}

function isDateMatch(expected: string, actual: unknown): boolean {
  // Präfix-Vergleich auf YYYY-MM
  const prefix = expected.substring(0, 7); // z.B. '2027-02'
  const actualStr = normalizeValue(actual);
  return actualStr.startsWith(prefix.toLowerCase());
}

function checkResult(dialog: EvalDialog, output: DialogOutput): boolean {
  const exp = dialog.expected;

  if ('intent' in exp) {
    return output.intent === exp.intent;
  }

  // expected.value — suche in answers nach dem passenden questionKey
  const answer = output.answers.find((a) => a.question_key === dialog.questionKey);
  if (!answer) {
    // Sonderfall: intent-only Treffer auch für value-Erwartungen zulässig wenn intent=answer
    return false;
  }

  const expectedVal = exp.value;
  const actualVal = answer.value;

  // Array-Vergleich (Mengen-Gleichheit)
  if (Array.isArray(expectedVal)) {
    return Array.isArray(actualVal)
      ? arraysEqualAsSet(expectedVal as unknown[], actualVal as unknown[])
      : false;
  }

  // Datum-Vergleich (YYYY-MM Präfix)
  if (typeof expectedVal === 'string' && /^\d{4}-\d{2}$/.test(expectedVal)) {
    return isDateMatch(expectedVal, actualVal);
  }

  // Boolean
  if (typeof expectedVal === 'boolean') {
    if (typeof actualVal === 'boolean') return actualVal === expectedVal;
    const s = normalizeValue(actualVal);
    if (expectedVal === true) return s === 'true' || s === 'ja' || s === '1';
    return s === 'false' || s === 'nein' || s === '0';
  }

  // Zahl
  if (typeof expectedVal === 'number') {
    const n = Number(actualVal);
    return !isNaN(n) && n === expectedVal;
  }

  // Text: substring-Match (toleranter Vergleich)
  if (typeof expectedVal === 'string') {
    return normalizeValue(actualVal).includes(normalizeValue(expectedVal));
  }

  return normalizeValue(actualVal) === normalizeValue(expectedVal);
}

// ---------------------------------------------------------------------------
// Parallelitäts-Pool (max CONCURRENCY gleichzeitige Calls)
// ---------------------------------------------------------------------------

async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  concurrency: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// Eval-Ergebnis-Typen
// ---------------------------------------------------------------------------

interface EvalResult {
  dialog: EvalDialog;
  hit: boolean;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Haupt-Eval-Logik
// ---------------------------------------------------------------------------

async function runEval(): Promise<void> {
  console.log('');
  console.log('=== Zoepp Media Cloud — Bot-Eval ===');
  console.log(`Modell: ${DIALOG_MODEL}`);
  console.log(`Dialoge: ${EVAL_DIALOGS.length}`);
  console.log(`Parallelität: ${CONCURRENCY}`);
  console.log(`Schwelle: ${(PASS_THRESHOLD * 100).toFixed(0)} %`);
  console.log('');

  const tasks = EVAL_DIALOGS.map((dialog) => async (): Promise<EvalResult> => {
    try {
      const ctx = buildContextForDialog(dialog);
      const systemBlocks = buildSystemBlocks(ctx);

      // System-Blöcke in SDK-Format übersetzen
      const sdkSystem: Array<{ type: 'text'; text: string }> = systemBlocks.map((b) => ({
        type: 'text' as const,
        text: b.text,
      }));

      const output = await llmJsonCallDirect(sdkSystem, dialog.userMessage, dialogOutputSchema);
      const hit = checkResult(dialog, output);
      return { dialog, hit, error: null };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { dialog, hit: false, error: msg };
    }
  });

  console.log('Starte Eval-Durchlauf...');
  const allResults = await runWithConcurrency(tasks, CONCURRENCY);
  console.log('Fertig.\n');

  // ---------------------------------------------------------------------------
  // Auswertung
  // ---------------------------------------------------------------------------

  const total = allResults.length;
  const totalHits = allResults.filter((r) => r.hit).length;
  const hitRate = totalHits / total;

  // Je Preset
  const presets = ['pflege', 'logistik', 'handwerk', 'gastro', 'vertrieb'] as const;
  const presetStats: Record<string, { hits: number; total: number }> = {};
  for (const p of presets) {
    const group = allResults.filter((r) => r.dialog.preset === p);
    presetStats[p] = {
      hits: group.filter((r) => r.hit).length,
      total: group.length,
    };
  }

  // Je Kategorie
  const categories = ['klar', 'dialekt', 'tippfehler', 'gegenfrage', 'abbruch', 'provokation'] as const;
  const catStats: Record<string, { hits: number; total: number }> = {};
  for (const c of categories) {
    const group = allResults.filter((r) => r.dialog.category === c);
    catStats[c] = {
      hits: group.filter((r) => r.hit).length,
      total: group.length,
    };
  }

  // Ausgabe
  console.log('=== Ergebnis ===');
  console.log(`Gesamt: ${totalHits}/${total} (${(hitRate * 100).toFixed(1)} %)`);
  console.log('');

  console.log('--- Je Preset ---');
  for (const p of presets) {
    const s = presetStats[p];
    const rate = s.total > 0 ? (s.hits / s.total) * 100 : 0;
    console.log(`  ${p.padEnd(12)} ${s.hits}/${s.total}  (${rate.toFixed(1)} %)`);
  }
  console.log('');

  console.log('--- Je Kategorie ---');
  for (const c of categories) {
    const s = catStats[c];
    const rate = s.total > 0 ? (s.hits / s.total) * 100 : 0;
    console.log(`  ${c.padEnd(14)} ${s.hits}/${s.total}  (${rate.toFixed(1)} %)`);
  }
  console.log('');

  // Fehlschläge
  const failures = allResults.filter((r) => !r.hit);
  if (failures.length > 0) {
    console.log(`--- Fehlschläge (${failures.length}) ---`);
    for (const f of failures) {
      const exp =
        'intent' in f.dialog.expected
          ? `intent:${f.dialog.expected.intent}`
          : `value:${JSON.stringify(f.dialog.expected.value)}`;
      const errSuffix = f.error ? ` [FEHLER: ${f.error}]` : '';
      console.log(`  FAIL  ${f.dialog.name}  (${f.dialog.category})  erwartet=${exp}${errSuffix}`);
    }
    console.log('');
  }

  // Gate
  const passSymbol = hitRate >= PASS_THRESHOLD ? 'PASS' : 'FAIL';
  console.log(`=== Gate: ${passSymbol} (${(hitRate * 100).toFixed(1)} % / Schwelle ${(PASS_THRESHOLD * 100).toFixed(0)} %) ===`);
  console.log('');

  if (hitRate < PASS_THRESHOLD) {
    console.error(`Release-Gate nicht bestanden: ${(hitRate * 100).toFixed(1)} % < ${(PASS_THRESHOLD * 100).toFixed(0)} %`);
    process.exit(1);
  }
}

runEval().catch((err: unknown) => {
  console.error('Unerwarteter Fehler:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
