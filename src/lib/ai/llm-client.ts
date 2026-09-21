/**
 * LlmClient — Anthropic-Wrapper mit JSON-Validierung, Retry und ai_calls-Logging.
 * Phase 3 Task 2.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';

export const DIALOG_MODEL: string =
  process.env.BOT_DIALOG_MODEL || 'claude-haiku-4-5';

export const SCORING_MODEL: string =
  process.env.BOT_SCORING_MODEL || 'claude-sonnet-4-6';

export interface LlmSystemBlock {
  text: string;
  cache?: boolean;
}

export interface LlmCallOpts<T> {
  agencyId: string;
  conversationId: string | null;
  purpose: 'dialog' | 'scoring' | 'simulate' | 'suggest';
  model: string;
  promptVersion: string;
  system: LlmSystemBlock[];
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  schema: z.ZodType<T>;
}

// Lazy Anthropic-Instanz — wirft sofort wenn Key fehlt
const anthropic = (): Anthropic => {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY nicht konfiguriert');
  }
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
};

// Hilfsfunktion: System-Blöcke in SDK-Format übersetzen
function buildSystemBlocks(
  system: LlmSystemBlock[],
): Array<{ type: 'text'; text: string; cache_control?: { type: 'ephemeral' } }> {
  return system.map((b) =>
    b.cache
      ? { type: 'text' as const, text: b.text, cache_control: { type: 'ephemeral' as const } }
      : { type: 'text' as const, text: b.text },
  );
}

// Hilfsfunktion: JSON aus Text extrahieren (direktes Parse, dann Regex-Fallback)
function extractJson(text: string): unknown {
  // Versuch 1: direktes JSON.parse
  try {
    return JSON.parse(text);
  } catch {
    // ignorieren
  }
  // Versuch 2: ersten {...}-Block per Regex extrahieren
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

// Interner Logging-Helper (best effort — Fehler werden stumm geschluckt)
function logAiCall(
  svc: SupabaseClient,
  payload: {
    agency_id: string;
    conversation_id: string | null;
    purpose: string;
    model: string;
    prompt_version: string;
    input_tokens: number | null;
    output_tokens: number | null;
    latency_ms: number;
    ok: boolean;
    error: string | null;
  },
): void {
  // PostgrestFilterBuilder ist kein nativer Promise — in Promise einwickeln
  void Promise.resolve(svc.from('ai_calls').insert(payload)).catch(() => {});
}

/**
 * Führt einen Anthropic-Aufruf durch, erwartet valides JSON in der Antwort.
 * Retry mit Hinweis-Message bei ungültigem JSON.
 * Loggt jeden Aufruf in ai_calls (best effort).
 */
export async function llmJsonCall<T>(
  svc: SupabaseClient,
  opts: LlmCallOpts<T>,
): Promise<T> {
  const client = anthropic();
  const systemBlocks = buildSystemBlocks(opts.system);
  const maxTokens = opts.maxTokens ?? 1024;
  const start = Date.now();

  let response: Awaited<ReturnType<typeof client.messages.create>>;

  // Erster Versuch
  try {
    response = await client.messages.create({
      model: opts.model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages: opts.messages,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logAiCall(svc, {
      agency_id: opts.agencyId,
      conversation_id: opts.conversationId,
      purpose: opts.purpose,
      model: opts.model,
      prompt_version: opts.promptVersion,
      input_tokens: null,
      output_tokens: null,
      latency_ms: Date.now() - start,
      ok: false,
      error: msg,
    });
    throw err;
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const rawText = textBlock && 'text' in textBlock ? textBlock.text : '';

  // JSON-Extraktion und Zod-Validierung (erster Versuch)
  const parsed = extractJson(rawText);
  const validated = parsed !== undefined ? opts.schema.safeParse(parsed) : { success: false as const };

  if (validated.success) {
    logAiCall(svc, {
      agency_id: opts.agencyId,
      conversation_id: opts.conversationId,
      purpose: opts.purpose,
      model: opts.model,
      prompt_version: opts.promptVersion,
      input_tokens: response.usage?.input_tokens ?? null,
      output_tokens: response.usage?.output_tokens ?? null,
      latency_ms: Date.now() - start,
      ok: true,
      error: null,
    });
    return (validated as { success: true; data: T }).data;
  }

  // Retry: zweiter Versuch mit fehlgeschlagener Assistent-Antwort und Hinweis-Message
  const retryMessages: Array<{ role: 'user' | 'assistant'; content: string }> = [
    ...opts.messages,
    { role: 'assistant', content: rawText },
    {
      role: 'user',
      content: 'Antworte ausschließlich mit gültigem JSON nach dem vorgegebenen Schema.',
    },
  ];

  let retryResponse: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    retryResponse = await client.messages.create({
      model: opts.model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages: retryMessages,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logAiCall(svc, {
      agency_id: opts.agencyId,
      conversation_id: opts.conversationId,
      purpose: opts.purpose,
      model: opts.model,
      prompt_version: opts.promptVersion,
      input_tokens: null,
      output_tokens: null,
      latency_ms: Date.now() - start,
      ok: false,
      error: msg,
    });
    throw err;
  }

  const retryTextBlock = retryResponse.content.find((b) => b.type === 'text');
  const retryRawText =
    retryTextBlock && 'text' in retryTextBlock ? retryTextBlock.text : '';

  const retryParsed = extractJson(retryRawText);
  const retryValidated =
    retryParsed !== undefined
      ? opts.schema.safeParse(retryParsed)
      : { success: false as const };

  if (retryValidated.success) {
    logAiCall(svc, {
      agency_id: opts.agencyId,
      conversation_id: opts.conversationId,
      purpose: opts.purpose,
      model: opts.model,
      prompt_version: opts.promptVersion,
      input_tokens: retryResponse.usage?.input_tokens ?? null,
      output_tokens: retryResponse.usage?.output_tokens ?? null,
      latency_ms: Date.now() - start,
      ok: true,
      error: null,
    });
    return (retryValidated as { success: true; data: T }).data;
  }

  // Beide Versuche fehlgeschlagen
  logAiCall(svc, {
    agency_id: opts.agencyId,
    conversation_id: opts.conversationId,
    purpose: opts.purpose,
    model: opts.model,
    prompt_version: opts.promptVersion,
    input_tokens: null,
    output_tokens: null,
    latency_ms: Date.now() - start,
    ok: false,
    error: 'KI-Antwort ungültig',
  });
  throw new Error('KI-Antwort ungültig');
}

/**
 * Führt einen Anthropic-Aufruf durch und liefert die Antwort als Text.
 * Loggt in ai_calls (best effort).
 */
export async function llmTextCall(
  svc: SupabaseClient,
  opts: Omit<LlmCallOpts<never>, 'schema'>,
): Promise<string> {
  const client = anthropic();
  const systemBlocks = buildSystemBlocks(opts.system);
  const maxTokens = opts.maxTokens ?? 1024;
  const start = Date.now();

  let response: Awaited<ReturnType<typeof client.messages.create>>;
  try {
    response = await client.messages.create({
      model: opts.model,
      max_tokens: maxTokens,
      system: systemBlocks,
      messages: opts.messages,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logAiCall(svc, {
      agency_id: opts.agencyId,
      conversation_id: opts.conversationId,
      purpose: opts.purpose,
      model: opts.model,
      prompt_version: opts.promptVersion,
      input_tokens: null,
      output_tokens: null,
      latency_ms: Date.now() - start,
      ok: false,
      error: msg,
    });
    throw err;
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  const text = textBlock && 'text' in textBlock ? textBlock.text : '';

  logAiCall(svc, {
    agency_id: opts.agencyId,
    conversation_id: opts.conversationId,
    purpose: opts.purpose,
    model: opts.model,
    prompt_version: opts.promptVersion,
    input_tokens: response.usage?.input_tokens ?? null,
    output_tokens: response.usage?.output_tokens ?? null,
    latency_ms: Date.now() - start,
    ok: true,
    error: null,
  });

  return text;
}
