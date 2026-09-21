/**
 * Tests für bot-process Worker (Phase 3, Task 7).
 * 12 Testfälle gemäß Task-7-Brief.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processBotTurn } from '../bot-process';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/ai/llm-client', () => ({
  llmJsonCall: vi.fn(),
  llmTextCall: vi.fn().mockResolvedValue('Begründung. Zusammenfassung.'),
  DIALOG_MODEL: 'claude-haiku-4-5',
  SCORING_MODEL: 'claude-sonnet-4-6',
}));

vi.mock('@/lib/bot/prompt', () => ({
  buildSystemBlocks: vi.fn().mockReturnValue([{ text: 'system', cache: true }]),
  buildTurnMessages: vi.fn().mockReturnValue([{ role: 'user', content: 'Hallo' }]),
  PROMPT_VERSION: 'v1',
}));

vi.mock('@/lib/bot/scoring', () => ({
  computeScore: vi.fn().mockReturnValue({ score: 85, label: 'A', knockout: false, reasons: [] }),
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.test', messageRowId: 'row-1' }),
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotificationForAgency: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/bot/timers', () => ({
  armBotTimersV2: vi.fn().mockResolvedValue(undefined),
  cancelBotTimers: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/bot/handover', () => ({
  handoverToHuman: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/workers/sla-reminders', () => ({
  scheduleStageReminders: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/appointments/lifecycle', () => ({
  createProposedAppointment: vi.fn().mockResolvedValue({
    appointmentId: 'appt-auto-1',
    bookingToken: 'tok-auto-1',
  }),
}));

vi.mock('@/lib/automations/fire', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Chain-Mock helper (from bot-open test style)
// ---------------------------------------------------------------------------

function makeSvc(tableResponses: Record<string, unknown> = {}) {
  const fromMock = vi.fn();

  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};

  function enqueue(table: string, resp: { data: unknown; error: unknown }) {
    if (!queues[table]) queues[table] = [];
    queues[table].push(resp);
  }

  function dequeue(table: string): { data: unknown; error: unknown } {
    if (queues[table] && queues[table].length > 0) return queues[table].shift()!;
    if (table in tableResponses) {
      const r = tableResponses[table];
      return r as { data: unknown; error: unknown };
    }
    return { data: null, error: null };
  }

  fromMock.mockImplementation((table: string) => {
    // Build a thenable chain so that `await svc.from(t).select().eq()` works
    // without an explicit .single()/.maybeSingle() terminal.
    function makeChain(): Record<string, unknown> {
      const chain: Record<string, unknown> = {};
      const methods = [
        'select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
        'insert', 'update', 'upsert', 'order', 'limit', 'gte', 'lte', 'neq',
      ];
      for (const m of methods) {
        chain[m] = vi.fn(() => chain);
      }

      // Make the chain itself a thenable (resolves with dequeue result)
      chain.then = (
        resolve: (v: { data: unknown; error: unknown }) => void,
        _reject?: (e: unknown) => void,
      ) => Promise.resolve(dequeue(table)).then(resolve, _reject);

      (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve(dequeue(table))
      );
      (chain.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve(dequeue(table))
      );

      // upsert resolves directly
      (chain.upsert as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve(dequeue(table))
      );

      // insert: returns a thenable chain
      (chain.insert as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const insertChain = makeChain();
        return insertChain;
      });

      // update: returns a thenable chain (so .update({}).eq().eq() resolves)
      (chain.update as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const updateChain = makeChain();
        return updateChain;
      });

      return chain;
    }

    return makeChain();
  });

  // rpc
  const rpcMock = vi.fn().mockResolvedValue({ data: null, error: null });

  return {
    svc: { from: fromMock, rpc: rpcMock } as unknown as Parameters<typeof processBotTurn>[0],
    fromMock,
    rpcMock,
    enqueue,
  };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AGENCY_ID = 'agency-1';
const CONV_ID = 'conv-1';
const APP_ID = 'app-1';
const CANDIDATE_ID = 'cand-1';
const JOB_ID = 'job-1';
const BOT_CONFIG_ID = 'cfg-1';
const WA_ACCOUNT_ID = 'wa-1';

const baseConversation = {
  id: CONV_ID,
  state: 'bot_active',
  bot_step: 0,
  bot_meta: {} as Record<string, unknown>,
  application_id: APP_ID,
  candidate_id: CANDIDATE_ID,
  wa_account_id: WA_ACCOUNT_ID,
  assigned_to: null,
  agency_id: AGENCY_ID,
};

const baseCandidate = {
  id: CANDIDATE_ID,
  name: 'Max Mustermann',
  phone_e164: '+491761234567',
};

const baseJob = {
  id: JOB_ID,
  title: 'Vertriebsmitarbeiter',
  description: 'D2D Vertrieb',
  location: 'Hamburg',
  agency_id: AGENCY_ID,
  bot_config_id: BOT_CONFIG_ID,
};

const baseBotConfig = {
  id: BOT_CONFIG_ID,
  active: true,
  agency_id: AGENCY_ID,
  persona: 'Alex',
  tone: 'freundlich',
  formality: 'du' as const,
  language: 'de',
  allowed_languages: ['de'],
  faq: [],
  intro_text: null,
  max_turns: 20,
  scoring_rules: { a_min: 75, b_min: 50 },
  handover_rules: {},
};

const baseApplication = {
  id: APP_ID,
  candidate_id: CANDIDATE_ID,
  job_id: JOB_ID,
  stage_id: 'stage-1',
  agency_id: AGENCY_ID,
};

const baseQuestion = {
  id: 'q-1',
  key: 'fuehrerschein',
  text: 'Hast du einen Führerschein Klasse B?',
  type: 'yes_no' as const,
  options: null,
  required: true,
  weight: 1,
  knockout_rule: null,
  position: 1,
};

const baseOutMessage = {
  id: 'msg-out-1',
  direction: 'out' as const,
  body: 'Hallo Max! Hast du einen Führerschein Klasse B?',
  created_at: '2024-01-01T10:00:00Z',
};

const baseInMessage = {
  id: 'msg-in-1',
  direction: 'in' as const,
  body: 'Ja, habe ich',
  created_at: '2024-01-01T10:01:00Z',
};

const baseAgency = {
  id: AGENCY_ID,
  name: 'Test Agentur GmbH',
};

// Standard dialog output: eine Antwort, intent 'answer'
const stdDialogOutput = {
  intent: 'answer' as const,
  answers: [{ question_key: 'fuehrerschein', value: true, confidence: 0.9, evidence: 'ja habe ich' }],
  needs_clarification: false,
  reply_text: 'Super! Noch eine Frage folgt.',
  handover: false,
  handover_reason: null,
};

/** Standard svc setup für einen einfachen Antwort-Turn */
function makeHappySvc(overrides: {
  conv?: Partial<typeof baseConversation>;
  messages?: typeof baseOutMessage[];
  inMessages?: typeof baseInMessage[];
  questions?: typeof baseQuestion[];
  answers?: Record<string, unknown>[];
  pipelineStage?: { id: string; stage_type: string } | null;
} = {}) {
  const { svc, fromMock, enqueue } = makeSvc();

  const conv = { ...baseConversation, ...(overrides.conv ?? {}) };
  const messages = [...(overrides.messages ?? [baseOutMessage]), ...(overrides.inMessages ?? [baseInMessage])];
  const questions = overrides.questions ?? [baseQuestion];
  const answers = overrides.answers ?? [];

  // Step 1: load conversation
  enqueue('conversations', { data: conv, error: null });
  // Step 2: load messages
  enqueue('messages', { data: messages, error: null });
  // Step 3: application
  enqueue('applications', { data: baseApplication, error: null });
  // Step 3: job
  enqueue('jobs', { data: baseJob, error: null });
  // Step 3: bot_config
  enqueue('bot_configs', { data: baseBotConfig, error: null });
  // Step 3: questions
  enqueue('bot_questions', { data: questions, error: null });
  // Step 3: existing answers
  enqueue('application_answers', { data: answers, error: null });
  // Step 3: candidate (for handover)
  enqueue('candidates', { data: baseCandidate, error: null });
  // Step 3: agency (for name in prompt context)
  enqueue('agencies', { data: baseAgency, error: null });
  // pipeline stage (for qualified check on completion)
  if (overrides.pipelineStage !== undefined) {
    enqueue('pipeline_stages', { data: overrides.pipelineStage, error: null });
  }

  return { svc, fromMock, enqueue };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('processBotTurn', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Reset llmJsonCall to default answer output
    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue(stdDialogOutput);
  });

  // -------------------------------------------------------------------------
  // Test 1: Conversation nicht mehr bot_active → No-op
  // -------------------------------------------------------------------------
  it('1. Conversation nicht mehr bot_active → No-op, kein LLM-Aufruf', async () => {
    const { svc: svc2, enqueue: eq2 } = makeSvc();
    eq2('conversations', { data: { ...baseConversation, state: 'waiting' }, error: null });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    await processBotTurn(svc2, AGENCY_ID, { conversation_id: CONV_ID }, 1);
    expect(llmJsonCall).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 2: Keine neuen Inbound-Nachrichten → No-op (Idempotenz)
  // -------------------------------------------------------------------------
  it('2. Keine neuen Inbound-Nachrichten seit letzter Bot-Ausgangsnachricht → No-op', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('conversations', { data: baseConversation, error: null });
    // messages: only an out-message, no in-message after it
    enqueue('messages', { data: [baseOutMessage], error: null });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);
    expect(llmJsonCall).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 3: Normale Antwort (intent 'answer', confidence 0.9)
  // -------------------------------------------------------------------------
  it('3. Normale Antwort: Antwort in application_answers upserted, reply gesendet, bot_step/meta/timer aktualisiert', async () => {
    // 2 Fragen: erste wird beantwortet, zweite ist nächste offene
    const q2 = { ...baseQuestion, id: 'q-2', key: 'erfahrung', position: 2, text: 'Erfahrung?' };
    const { svc, fromMock } = makeHappySvc({ questions: [baseQuestion, q2] });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue(stdDialogOutput);

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const { armBotTimersV2, cancelBotTimers } = await import('@/lib/bot/timers');

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    // application_answers upsert wurde aufgerufen
    const appAnswersCalls = (fromMock.mock.calls as unknown[][]).filter(
      (c) => c[0] === 'application_answers'
    );
    expect(appAnswersCalls.length).toBeGreaterThan(0);

    // reply_text gesendet
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ senderType: 'bot' })
    );

    // cancelBotTimers und dann armBotTimersV2 aufgerufen
    expect(cancelBotTimers).toHaveBeenCalled();
    expect(armBotTimersV2).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agencyId: AGENCY_ID, conversationId: CONV_ID })
    );
  });

  // -------------------------------------------------------------------------
  // Test 4: Antworten auf nicht-konfigurierte question_keys werden NICHT gespeichert (P3-R10)
  // -------------------------------------------------------------------------
  it('4. Antworten auf nicht-konfigurierte question_keys werden NICHT gespeichert', async () => {
    const { svc, fromMock } = makeHappySvc();

    const dialogOutputWithUnknownKey = {
      ...stdDialogOutput,
      answers: [
        { question_key: 'fuehrerschein', value: true, confidence: 0.9, evidence: 'ja' },
        { question_key: 'UNBEKANNT_KEY', value: 'xyz', confidence: 0.8, evidence: 'test' },
      ],
    };

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue(dialogOutputWithUnknownKey);

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    // Prüfe upsert-Aufrufe auf application_answers:
    // Nur 'fuehrerschein' darf gespeichert werden, NICHT 'UNBEKANNT_KEY'
    const upsertCalls: Array<{ question_key: string }[]> = [];
    for (const call of fromMock.mock.calls as unknown[][]) {
      if (call[0] !== 'application_answers') continue;
      const idx = fromMock.mock.calls.indexOf(call as never);
      const chain = fromMock.mock.results[idx]?.value as Record<string, ReturnType<typeof vi.fn>>;
      if (chain?.upsert?.mock?.calls?.length > 0) {
        const upsertArg = chain.upsert.mock.calls[0][0];
        upsertCalls.push(Array.isArray(upsertArg) ? upsertArg : [upsertArg]);
      }
    }

    const allKeys = upsertCalls.flat().map((r) => r.question_key);
    expect(allKeys).not.toContain('UNBEKANNT_KEY');
  });

  // -------------------------------------------------------------------------
  // Test 5: intent 'handover_request' oder handover: true → handoverToHuman
  // -------------------------------------------------------------------------
  it('5. intent: handover_request → handoverToHuman, kein Weiterfragen', async () => {
    const { svc } = makeHappySvc();

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      intent: 'handover_request',
      handover: false,
      handover_reason: 'Bewerber hat Frage gestellt',
    });

    const { handoverToHuman } = await import('@/lib/bot/handover');
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(handoverToHuman).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agencyId: AGENCY_ID, conversationId: CONV_ID })
    );
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('5b. handover: true → handoverToHuman, kein Weiterfragen', async () => {
    const { svc } = makeHappySvc();

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      intent: 'answer',
      handover: true,
      handover_reason: 'Spezialanfrage',
    });

    const { handoverToHuman } = await import('@/lib/bot/handover');
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(handoverToHuman).toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 6: confidence < 0.6 zweimal → Übergabe; einmal niedrig, dann hoch → Zähler-Reset
  // -------------------------------------------------------------------------
  it('6a. confidence < 0.6 zweimal in Folge → handoverToHuman', async () => {
    // low_confidence bereits 1 (also zweites Mal niedrig)
    const { svc } = makeHappySvc({ conv: { bot_meta: { low_confidence: 1 } } });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      answers: [{ question_key: 'fuehrerschein', value: true, confidence: 0.4, evidence: 'vll' }],
    });

    const { handoverToHuman } = await import('@/lib/bot/handover');
    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(handoverToHuman).toHaveBeenCalled();
  });

  it('6b. einmal niedrige confidence, dann hohe → Zähler-Reset, kein Handover', async () => {
    // low_confidence = 1 (einmal niedrig), aber jetzt hohe confidence → Reset
    const { svc } = makeHappySvc({
      conv: { bot_meta: { low_confidence: 1 } },
      questions: [baseQuestion, { ...baseQuestion, id: 'q-2', key: 'erfahrung', position: 2 }],
    });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      answers: [{ question_key: 'fuehrerschein', value: true, confidence: 0.9, evidence: 'ja' }],
    });

    const { handoverToHuman } = await import('@/lib/bot/handover');
    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(handoverToHuman).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 7: needs_clarification: true → clarify-Zähler; beim 3. Klärungsversuch → Übergabe
  // -------------------------------------------------------------------------
  it('7a. needs_clarification: true → clarify-Zähler inkrementiert, kein Handover beim 1. Mal', async () => {
    const { svc, fromMock } = makeHappySvc({
      questions: [baseQuestion, { ...baseQuestion, id: 'q-2', key: 'erfahrung', position: 2 }],
    });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      intent: 'unclear',
      needs_clarification: true,
      answers: [{ question_key: 'fuehrerschein', value: null, confidence: 0.3, evidence: '' }],
    });

    const { handoverToHuman } = await import('@/lib/bot/handover');
    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(handoverToHuman).not.toHaveBeenCalled();

    // conversations.update wurde mit bot_meta.clarify.fuehrerschein = 1 aufgerufen
    let foundClarify = false;
    for (const call of fromMock.mock.calls as unknown[][]) {
      if (call[0] !== 'conversations') continue;
      const idx = (fromMock.mock.calls as unknown[][]).indexOf(call);
      const chain = fromMock.mock.results[idx]?.value as Record<string, ReturnType<typeof vi.fn>>;
      if (chain?.update?.mock?.calls?.length > 0) {
        for (const updateCall of chain.update.mock.calls) {
          const arg = (updateCall as unknown[])[0] as Record<string, unknown>;
          const meta = arg?.bot_meta as Record<string, unknown> | undefined;
          const clarify = meta?.clarify as Record<string, unknown> | undefined;
          if (clarify?.fuehrerschein === 1) {
            foundClarify = true;
          }
        }
      }
    }
    expect(foundClarify).toBe(true);
  });

  it('7b. 3. Klärungsversuch derselben Frage (clarify-Zähler > 2) → Übergabe', async () => {
    // clarify.fuehrerschein = 2 → nächster Versuch = 3 → Übergabe
    const { svc } = makeHappySvc({
      conv: { bot_meta: { clarify: { fuehrerschein: 2 } } },
    });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      intent: 'unclear',
      needs_clarification: true,
      answers: [{ question_key: 'fuehrerschein', value: null, confidence: 0.2, evidence: '' }],
    });

    const { handoverToHuman } = await import('@/lib/bot/handover');
    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(handoverToHuman).toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test 8: bot_meta.turns >= config.max_turns → Übergabe
  // -------------------------------------------------------------------------
  it('8. bot_meta.turns >= config.max_turns → Übergabe mit reason "Maximale Gesprächslänge erreicht"', async () => {
    const { svc } = makeHappySvc({
      conv: { bot_meta: { turns: 20 } }, // max_turns = 20 in baseBotConfig
    });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue(stdDialogOutput);

    const { handoverToHuman } = await import('@/lib/bot/handover');
    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(handoverToHuman).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: 'Maximale Gesprächslänge erreicht' })
    );
  });

  // -------------------------------------------------------------------------
  // Test 9: Alle required-Fragen beantwortet → Abschluss, Score, state='waiting'
  // -------------------------------------------------------------------------
  it('9. Alle required-Fragen beantwortet → Abschluss-Scoring, state=waiting, cancelBotTimers, logActivity bot_completed', async () => {
    // fuehrerschein ist bereits beantwortet
    const existingAnswers = [{ question_key: 'fuehrerschein', answer_normalized: { value: true, confidence: 0.9 }, origin: 'bot' }];
    const { svc, enqueue, fromMock } = makeHappySvc({
      answers: existingAnswers,
    });

    // Add pipeline stage for qualified
    enqueue('pipeline_stages', { data: { id: 'stage-qualified', stage_type: 'qualified' }, error: null });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    // LLM returns answer for the already-answered question (but it's already in answers)
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      answers: [{ question_key: 'fuehrerschein', value: true, confidence: 0.9, evidence: 'ja' }],
    });

    const { computeScore } = await import('@/lib/bot/scoring');
    (computeScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 85, label: 'A', knockout: false, reasons: [] });

    const { cancelBotTimers } = await import('@/lib/bot/timers');
    const { logActivity } = await import('@/lib/activity/log');
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    // computeScore wurde aufgerufen
    expect(computeScore).toHaveBeenCalled();

    // cancelBotTimers wurde aufgerufen
    expect(cancelBotTimers).toHaveBeenCalled();

    // logActivity mit bot_completed
    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action_type: 'bot_completed' })
    );

    // Abschlussnachricht ohne Entscheidung an Bewerber
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ senderType: 'bot' })
    );

    // conversations.update wurde mit state='waiting' aufgerufen
    let foundWaiting = false;
    for (const call of fromMock.mock.calls as unknown[][]) {
      if (call[0] !== 'conversations') continue;
      const idx = (fromMock.mock.calls as unknown[][]).indexOf(call);
      const chain = fromMock.mock.results[idx]?.value as Record<string, ReturnType<typeof vi.fn>>;
      if (chain?.update?.mock?.calls?.length > 0) {
        for (const updateCall of chain.update.mock.calls) {
          const arg = (updateCall as unknown[])[0] as Record<string, unknown>;
          if (arg?.state === 'waiting') {
            foundWaiting = true;
          }
        }
      }
    }
    expect(foundWaiting).toBe(true);
  });

  // -------------------------------------------------------------------------
  // Test 9b: Abschluss mit Score A → scheduleStageReminders für qualified-Stage
  // -------------------------------------------------------------------------
  it('9b. Abschluss mit Score A → scheduleStageReminders mit qualified-Stage aufgerufen', async () => {
    const existingAnswers = [{ question_key: 'fuehrerschein', answer_normalized: { value: true, confidence: 0.9 }, origin: 'bot' }];
    const { svc, enqueue } = makeHappySvc({ answers: existingAnswers });
    enqueue('pipeline_stages', {
      data: { id: 'stage-qualified', stage_type: 'qualified', requires_documents: false },
      error: null,
    });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      answers: [{ question_key: 'fuehrerschein', value: true, confidence: 0.9, evidence: 'ja' }],
    });
    const { computeScore } = await import('@/lib/bot/scoring');
    (computeScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 85, label: 'A', knockout: false, reasons: [] });

    const { scheduleStageReminders } = await import('@/lib/workers/sla-reminders');
    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(scheduleStageReminders).toHaveBeenCalledWith(
      expect.anything(),
      AGENCY_ID,
      APP_ID,
      'stage-qualified',
      'qualified',
      false,
    );
  });

  // -------------------------------------------------------------------------
  // Test 10: Bereits beantwortete Fragen werden übersprungen (aus Indeed)
  // -------------------------------------------------------------------------
  it('10. Bereits (aus Indeed) beantwortete Fragen werden übersprungen; currentQuestionKey = erste offene', async () => {
    const q2 = { ...baseQuestion, id: 'q-2', key: 'erfahrung', position: 2, text: 'Erfahrung vorhanden?' };
    // fuehrerschein already answered, erfahrung is open
    const existingAnswers = [
      { question_key: 'fuehrerschein', answer_normalized: { value: true, confidence: 1.0 }, origin: 'indeed' },
    ];
    const { svc } = makeHappySvc({ questions: [baseQuestion, q2], answers: existingAnswers });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      answers: [{ question_key: 'erfahrung', value: true, confidence: 0.85, evidence: 'ja' }],
    });

    const { buildTurnMessages } = await import('@/lib/bot/prompt');

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    // buildTurnMessages (und buildSystemBlocks) wurden aufgerufen
    expect(llmJsonCall).toHaveBeenCalled();
    // The context should have 'fuehrerschein' as 'beantwortet' and 'erfahrung' as 'offen'
    // We verify buildSystemBlocks was called with correct context via prompt.buildSystemBlocks mock
    const { buildSystemBlocks } = await import('@/lib/bot/prompt');
    expect(buildSystemBlocks).toHaveBeenCalledWith(
      expect.objectContaining({
        currentQuestionKey: 'erfahrung',
      })
    );
    void buildTurnMessages;
  });

  // -------------------------------------------------------------------------
  // Test 11: llmJsonCall wirft + attempts < 3 → Fehler propagiert; attempts >= 3 → handoverToHuman
  // -------------------------------------------------------------------------
  it('11a. llmJsonCall wirft + attempts < 3 → Fehler propagiert (tick-Retry)', async () => {
    const { svc } = makeHappySvc();

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('KI-Antwort ungültig'));

    await expect(
      processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 2)
    ).rejects.toThrow('KI-Antwort ungültig');
  });

  it('11b. llmJsonCall wirft + attempts >= 3 → kein Throw, handoverToHuman mit "Bot gerade nicht verfügbar"', async () => {
    const { svc } = makeHappySvc();

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('KI-Antwort ungültig'));

    const { handoverToHuman } = await import('@/lib/bot/handover');

    await expect(
      processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 3)
    ).resolves.toBeUndefined();

    expect(handoverToHuman).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: 'Bot gerade nicht verfügbar' })
    );
  });

  // -------------------------------------------------------------------------
  // Test Fix-1: intent: 'reschedule' → handoverToHuman, kein Reply
  // -------------------------------------------------------------------------
  it('F1. intent: reschedule → handoverToHuman mit "Terminwunsch des Bewerbers", kein Reply', async () => {
    const { svc } = makeHappySvc();

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      intent: 'reschedule',
      handover: false,
    });

    const { handoverToHuman } = await import('@/lib/bot/handover');
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(handoverToHuman).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: 'Terminwunsch des Bewerbers' })
    );
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Test Fix-2: intent: 'off_topic' → kein Handover, reply gesendet
  // -------------------------------------------------------------------------
  it('F2. intent: off_topic, keine Antworten, needs_clarification false → kein Handover, reply gesendet, keine Antworten gespeichert', async () => {
    const q2 = { ...baseQuestion, id: 'q-2', key: 'erfahrung', position: 2 };
    const { svc, fromMock } = makeHappySvc({
      questions: [baseQuestion, q2],
    });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      intent: 'off_topic',
      needs_clarification: false,
      answers: [],
      reply_text: 'Zurück zur Frage: Hast du einen Führerschein?',
    });

    const { handoverToHuman } = await import('@/lib/bot/handover');
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(handoverToHuman).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ senderType: 'bot' })
    );

    // Keine Antworten in application_answers gespeichert
    let upsertCalled = false;
    for (const call of fromMock.mock.calls as unknown[][]) {
      if (call[0] !== 'application_answers') continue;
      const idx = (fromMock.mock.calls as unknown[][]).indexOf(call);
      const chain = fromMock.mock.results[idx]?.value as Record<string, ReturnType<typeof vi.fn>>;
      if (chain?.upsert?.mock?.calls?.length > 0) {
        upsertCalled = true;
      }
    }
    expect(upsertCalled).toBe(false);
  });

  // -------------------------------------------------------------------------
  // Test Fix-3: low_confidence-Zähler bleibt bei antwortlosem Turn unverändert
  // -------------------------------------------------------------------------
  it('F3. low_confidence=1 vorher, Turn ohne Antworten (intent question) → low_confidence bleibt 1', async () => {
    const q2 = { ...baseQuestion, id: 'q-2', key: 'erfahrung', position: 2 };
    const { svc, fromMock } = makeHappySvc({
      conv: { bot_meta: { low_confidence: 1 } },
      questions: [baseQuestion, q2],
    });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      intent: 'question',
      needs_clarification: false,
      answers: [],
      reply_text: 'Das beantworte ich gern. Also, hast du einen Führerschein?',
    });

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    // conversations.update muss bot_meta.low_confidence = 1 enthalten (nicht 0 oder 2)
    let foundLowConfidence: number | undefined;
    for (const call of fromMock.mock.calls as unknown[][]) {
      if (call[0] !== 'conversations') continue;
      const idx = (fromMock.mock.calls as unknown[][]).indexOf(call);
      const chain = fromMock.mock.results[idx]?.value as Record<string, ReturnType<typeof vi.fn>>;
      if (chain?.update?.mock?.calls?.length > 0) {
        for (const updateCall of chain.update.mock.calls) {
          const arg = (updateCall as unknown[])[0] as Record<string, unknown>;
          const meta = arg?.bot_meta as Record<string, unknown> | undefined;
          if (meta && 'low_confidence' in meta) {
            foundLowConfidence = meta.low_confidence as number;
          }
        }
      }
    }
    expect(foundLowConfidence).toBe(1);
  });

  // -------------------------------------------------------------------------
  // Test 12: intent: 'stop' → No-op, state unangetastet
  // -------------------------------------------------------------------------
  it('12. intent: stop → No-op, kein Handover, state unangetastet', async () => {
    const { svc, fromMock } = makeHappySvc();

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      intent: 'stop',
    });

    const { handoverToHuman } = await import('@/lib/bot/handover');
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 1);

    expect(handoverToHuman).not.toHaveBeenCalled();
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();

    // conversations.update sollte NICHT mit state-Änderung aufgerufen worden sein
    // (da stop schon von inbound behandelt wird; wir machen keine state-Mutation hier)
    const convUpdateCalls: unknown[] = [];
    for (const call of fromMock.mock.calls as unknown[][]) {
      if (call[0] !== 'conversations') continue;
      const idx = fromMock.mock.calls.indexOf(call as never);
      const chain = fromMock.mock.results[idx]?.value as Record<string, ReturnType<typeof vi.fn>>;
      if (chain?.update?.mock?.calls?.length > 0) {
        convUpdateCalls.push(...chain.update.mock.calls);
      }
    }
    // No state change to conversations
    for (const call of convUpdateCalls) {
      const updateArg = (call as unknown[])[0] as Record<string, unknown>;
      expect(updateArg?.state).not.toBeDefined();
    }
  });

  // -------------------------------------------------------------------------
  // Phase 4 Task 7: Bei Score A/B → Termineinladung senden
  // -------------------------------------------------------------------------
  it('Phase 4: Bei Score A/B wird createProposedAppointment aufgerufen und appointment_invite-Template gesendet', async () => {
    // Setup: fuehrerschein bereits beantwortet (alle required beantwortet), Score A
    const existingAnswers = [{ question_key: 'fuehrerschein', answer_normalized: { value: true, confidence: 0.9 }, origin: 'bot' }];
    const { svc, enqueue } = makeHappySvc({ answers: existingAnswers });

    // pipeline stage für qualified
    enqueue('pipeline_stages', { data: { id: 'stage-qualified', stage_type: 'qualified' }, error: null });
    // whatsapp_templates für appointment_invite
    enqueue('whatsapp_templates', { data: { id: 'tmpl-invite', name: 'appointment_invite_de' }, error: null });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      answers: [{ question_key: 'fuehrerschein', value: true, confidence: 0.9, evidence: 'ja' }],
    });

    const { computeScore } = await import('@/lib/bot/scoring');
    (computeScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 85, label: 'A', knockout: false, reasons: [] });

    const { createProposedAppointment } = await import('@/lib/appointments/lifecycle');
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const { fireEvent } = await import('@/lib/automations/fire');

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 0);

    expect(createProposedAppointment).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agencyId: AGENCY_ID }),
    );
    // appointment_invite Template muss gesendet werden, mit Buchungslink in den templateParams
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        senderType: 'system',
        payload: expect.objectContaining({
          template: expect.objectContaining({
            components: expect.arrayContaining([
              expect.objectContaining({
                parameters: expect.arrayContaining([
                  expect.objectContaining({
                    text: expect.stringContaining('/book/tok-auto-1'),
                  }),
                ]),
              }),
            ]),
          }),
        }),
      }),
    );
    // fireEvent bot.completed muss aufgerufen werden
    expect(fireEvent).toHaveBeenCalledWith('bot.completed', AGENCY_ID, expect.anything());
  });

  it('Phase 4: Bei Score C wird KEIN Termin erstellt', async () => {
    // Setup: fuehrerschein bereits beantwortet (alle required beantwortet), Score C
    const existingAnswers = [{ question_key: 'fuehrerschein', answer_normalized: { value: false, confidence: 0.9 }, origin: 'bot' }];
    const { svc } = makeHappySvc({ answers: existingAnswers });

    const { llmJsonCall } = await import('@/lib/ai/llm-client');
    (llmJsonCall as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...stdDialogOutput,
      answers: [{ question_key: 'fuehrerschein', value: false, confidence: 0.9, evidence: 'nein' }],
    });

    const { computeScore } = await import('@/lib/bot/scoring');
    (computeScore as ReturnType<typeof vi.fn>).mockReturnValue({ score: 20, label: 'C', knockout: false, reasons: [] });

    const { createProposedAppointment } = await import('@/lib/appointments/lifecycle');

    await processBotTurn(svc, AGENCY_ID, { conversation_id: CONV_ID }, 0);

    expect(createProposedAppointment).not.toHaveBeenCalled();
  });
});
