/**
 * Tests für llm-client (LlmClient — Anthropic-Wrapper mit JSON-Validierung, Retry und ai_calls-Logging).
 * Phase 3 Task 2.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';

// ANTHROPIC_API_KEY setzen damit der Guard in llm-client nicht wirft
// (der eigentliche SDK-Aufruf ist gemockt)
process.env.ANTHROPIC_API_KEY = 'test-key-for-unit-tests';

// Gemeinsames Mock-Objekt — wird von der vi.mock-Factory und den Tests geteilt
const mockMessages = { create: vi.fn() };

// Anthropic-SDK mocken — MUSS vor dem Import des Moduls geschehen (hoisting).
// Die Factory muss eine ECHTE Klasse (function, nicht arrow) exportieren,
// damit `new Anthropic(...)` im Produktionscode funktioniert.
vi.mock('@anthropic-ai/sdk', () => {
  // mockMessages ist im Closure der Factory sichtbar (kein hoisting-Problem,
  // da vi.mock-Callbacks nach vi.fn()-Aufrufen ausgewertet werden)
  function AnthropicMock() {
    return { messages: mockMessages };
  }
  return { default: AnthropicMock };
});

import { llmJsonCall, llmTextCall, DIALOG_MODEL, SCORING_MODEL, type LlmCallOpts } from '../llm-client';

// Helper: messages.create-Mock abrufen
function getCreateMock() {
  return mockMessages.create;
}

// Helper: Supabase-Chain-Mock (folgt Muster aus whatsapp-inbound.test.ts)
// Der ai_calls-Insert-Chain muss Promise-artig sein (.catch wird aufgerufen).
function makeSvc(insertResult: { data: unknown; error: unknown } = { data: null, error: null }) {
  const fromMock = vi.fn();

  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'insert', 'update', 'upsert', 'single', 'maybeSingle'];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }

    if (table === 'ai_calls') {
      // insertChain ist ein Promise (resolved), hat aber auch alle Chain-Methoden
      const insertChain = Object.assign(
        Promise.resolve(insertResult),
        Object.fromEntries(methods.map((m) => [m, vi.fn(() => insertChain)])),
      ) as Record<string, unknown>;
      (chain.insert as ReturnType<typeof vi.fn>).mockReturnValue(insertChain);
    }

    return chain;
  });

  return { from: fromMock } as unknown as Parameters<typeof llmJsonCall>[0];
}

// Hilfsfunktion: eine synthetische Anthropic-Antwort bauen
function makeAnthropicResponse(text: string, usage = { input_tokens: 50, output_tokens: 20 }) {
  return {
    id: 'msg_test',
    content: [{ type: 'text', text }],
    usage,
    model: 'claude-haiku-4-5',
    role: 'assistant',
    stop_reason: 'end_turn',
    type: 'message',
  };
}

const schema = z.object({ score: z.number(), label: z.string() });
type Schema = z.infer<typeof schema>;

const baseOpts: LlmCallOpts<Schema> = {
  agencyId: 'agency-1',
  conversationId: 'conv-1',
  purpose: 'scoring',
  model: 'claude-haiku-4-5',
  promptVersion: 'v1',
  system: [{ text: 'Du bist ein Assistent.' }],
  messages: [{ role: 'user', content: 'Bewerte diesen Bewerber.' }],
  maxTokens: 256,
  schema,
};

describe('DIALOG_MODEL / SCORING_MODEL Konstanten', () => {
  it('DIALOG_MODEL hat den Standardwert claude-haiku-4-5', () => {
    expect(DIALOG_MODEL).toBe('claude-haiku-4-5');
  });

  it('SCORING_MODEL hat den Standardwert claude-sonnet-4-6', () => {
    expect(SCORING_MODEL).toBe('claude-sonnet-4-6');
  });
});

describe('llmJsonCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset the create mock on the Anthropic class
    const createFn = getCreateMock();
    createFn.mockReset();
  });

  it('T1: parst gültiges JSON aus content[0].text und liefert per Zod-validiertes Objekt', async () => {
    const createFn = getCreateMock();
    const validJson = JSON.stringify({ score: 0.9, label: 'geeignet' });
    createFn.mockResolvedValueOnce(makeAnthropicResponse(validJson));

    const svc = makeSvc();
    const result = await llmJsonCall(svc, baseOpts);

    expect(result).toEqual({ score: 0.9, label: 'geeignet' });
  });

  it('T2: ungültiges JSON beim ersten Versuch → zweiter SDK-Aufruf mit Retry-Message; gültige zweite Antwort wird geliefert', async () => {
    const createFn = getCreateMock();
    createFn
      .mockResolvedValueOnce(makeAnthropicResponse('das ist kein json'))
      .mockResolvedValueOnce(makeAnthropicResponse(JSON.stringify({ score: 0.5, label: 'unklar' })));

    const svc = makeSvc();
    const result = await llmJsonCall(svc, baseOpts);

    expect(result).toEqual({ score: 0.5, label: 'unklar' });
    expect(createFn).toHaveBeenCalledTimes(2);
    // Zweiter Aufruf muss die Retry-Message enthalten
    const secondCall = createFn.mock.calls[1][0];
    const lastMsg = secondCall.messages[secondCall.messages.length - 1];
    expect(lastMsg.role).toBe('user');
    expect(lastMsg.content).toBe('Antworte ausschließlich mit gültigem JSON nach dem vorgegebenen Schema.');
  });

  it('T3: beide Versuche ungültig → wirft Error("KI-Antwort ungültig"); ai_calls-Insert mit ok: false erfolgt', async () => {
    const createFn = getCreateMock();
    createFn
      .mockResolvedValueOnce(makeAnthropicResponse('kein json #1'))
      .mockResolvedValueOnce(makeAnthropicResponse('kein json #2'));

    const svc = makeSvc();
    await expect(llmJsonCall(svc, baseOpts)).rejects.toThrow('KI-Antwort ungültig');

    // ai_calls insert muss aufgerufen worden sein
    const fromCalls = (svc.from as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const aiCallsInsert = fromCalls.find((args) => args[0] === 'ai_calls');
    expect(aiCallsInsert).toBeDefined();

    // Das Insert-Payload muss ok: false enthalten
    const tableChain = (svc.from as ReturnType<typeof vi.fn>).mock.results.find(
      (_: unknown, i: number) => fromCalls[i][0] === 'ai_calls'
    )?.value as Record<string, ReturnType<typeof vi.fn>>;
    const insertPayload = (tableChain?.insert as ReturnType<typeof vi.fn>)?.mock.calls[0]?.[0];
    expect(insertPayload).toMatchObject({ ok: false });
  });

  it('T4: SDK wirft (Netzwerk) → llmJsonCall wirft; ai_calls-Insert mit ok: false und error-Nachricht', async () => {
    const createFn = getCreateMock();
    createFn.mockRejectedValueOnce(new Error('Netzwerkfehler: ECONNREFUSED'));

    const svc = makeSvc();
    await expect(llmJsonCall(svc, baseOpts)).rejects.toThrow('Netzwerkfehler: ECONNREFUSED');

    const fromCalls = (svc.from as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const aiCallsInsert = fromCalls.find((args) => args[0] === 'ai_calls');
    expect(aiCallsInsert).toBeDefined();

    const tableChain = (svc.from as ReturnType<typeof vi.fn>).mock.results.find(
      (_: unknown, i: number) => fromCalls[i][0] === 'ai_calls'
    )?.value as Record<string, ReturnType<typeof vi.fn>>;
    const insertPayload = (tableChain?.insert as ReturnType<typeof vi.fn>)?.mock.calls[0]?.[0];
    expect(insertPayload).toMatchObject({
      ok: false,
      error: 'Netzwerkfehler: ECONNREFUSED',
    });
  });

  it('T5: Erfolgsfall loggt ai_calls mit agency_id, conversation_id, purpose, model, prompt_version, tokens, latency_ms > 0, ok: true', async () => {
    const createFn = getCreateMock();
    // Minimale Verzögerung damit latency_ms > 0 ist
    createFn.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(
        makeAnthropicResponse(JSON.stringify({ score: 0.8, label: 'gut' }), {
          input_tokens: 100,
          output_tokens: 30,
        })
      ), 2))
    );

    const svc = makeSvc();
    await llmJsonCall(svc, baseOpts);

    const fromCalls = (svc.from as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const aiCallsInsert = fromCalls.find((args) => args[0] === 'ai_calls');
    expect(aiCallsInsert).toBeDefined();

    const tableChain = (svc.from as ReturnType<typeof vi.fn>).mock.results.find(
      (_: unknown, i: number) => fromCalls[i][0] === 'ai_calls'
    )?.value as Record<string, ReturnType<typeof vi.fn>>;
    const insertPayload = (tableChain?.insert as ReturnType<typeof vi.fn>)?.mock.calls[0]?.[0];

    expect(insertPayload).toMatchObject({
      agency_id: 'agency-1',
      conversation_id: 'conv-1',
      purpose: 'scoring',
      model: 'claude-haiku-4-5',
      prompt_version: 'v1',
      input_tokens: 100,
      output_tokens: 30,
      ok: true,
      error: null,
    });
    expect(insertPayload.latency_ms).toBeGreaterThan(0);
  });

  it('T6: System-Blöcke mit cache: true erhalten cache_control: { type: "ephemeral" } im SDK-Aufruf', async () => {
    const createFn = getCreateMock();
    createFn.mockResolvedValueOnce(
      makeAnthropicResponse(JSON.stringify({ score: 0.7, label: 'okay' }))
    );

    const svc = makeSvc();
    const optsWithCache: LlmCallOpts<Schema> = {
      ...baseOpts,
      system: [
        { text: 'Du bist ein Assistent.', cache: true },
        { text: 'Ohne Cache.' },
        { text: 'Auch gecacht.', cache: true },
      ],
    };

    await llmJsonCall(svc, optsWithCache);

    const sdkCall = createFn.mock.calls[0][0];
    const systemBlocks: Array<{ type: string; text: string; cache_control?: { type: string } }> =
      sdkCall.system;

    expect(systemBlocks[0]).toMatchObject({
      type: 'text',
      text: 'Du bist ein Assistent.',
      cache_control: { type: 'ephemeral' },
    });
    expect(systemBlocks[1]).toMatchObject({ type: 'text', text: 'Ohne Cache.' });
    expect(systemBlocks[1].cache_control).toBeUndefined();
    expect(systemBlocks[2]).toMatchObject({
      type: 'text',
      text: 'Auch gecacht.',
      cache_control: { type: 'ephemeral' },
    });
  });

  it('T7: JSON innerhalb von Text extrahieren (Regex-Fallback auf ersten {…}-Block)', async () => {
    const createFn = getCreateMock();
    // Response enthält JSON eingebettet in Text
    const embeddedJson = 'Hier ist meine Antwort: {"score": 0.3, "label": "schwach"} Ende.';
    createFn.mockResolvedValueOnce(makeAnthropicResponse(embeddedJson));

    const svc = makeSvc();
    const result = await llmJsonCall(svc, baseOpts);

    expect(result).toEqual({ score: 0.3, label: 'schwach' });
  });
});

describe('llmTextCall', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const createFn = getCreateMock();
    createFn.mockReset();
  });

  it('T8: gibt den Text aus content[0] zurück und loggt ai_calls', async () => {
    const createFn = getCreateMock();
    createFn.mockResolvedValueOnce(makeAnthropicResponse('Hallo, wie kann ich helfen?'));

    const svc = makeSvc();
    const result = await llmTextCall(svc, {
      agencyId: 'agency-1',
      conversationId: null,
      purpose: 'dialog',
      model: DIALOG_MODEL,
      promptVersion: 'v2',
      system: [{ text: 'Du bist ein Bot.' }],
      messages: [{ role: 'user', content: 'Hallo!' }],
    });

    expect(result).toBe('Hallo, wie kann ich helfen?');

    // ai_calls wird geloggt
    const fromCalls = (svc.from as ReturnType<typeof vi.fn>).mock.calls as unknown[][];
    const aiCallsInsert = fromCalls.find((args) => args[0] === 'ai_calls');
    expect(aiCallsInsert).toBeDefined();
  });
});
