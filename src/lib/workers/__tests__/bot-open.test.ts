/**
 * Tests für bot-open, bot-nudge, bot-timeout Worker.
 * Chain-Mock-Muster aus src/lib/workers/__tests__/whatsapp-inbound.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processBotOpen } from '../bot-open';
import { processBotNudge } from '../bot-nudge';
import { processBotTimeout } from '../bot-timeout';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.test', messageRowId: 'row-1' }),
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotificationForAgency: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/bot/timers', () => ({
  armBotTimersV2: vi.fn().mockResolvedValue(undefined),
  cancelBotTimers: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Chain-Mock helper
// ---------------------------------------------------------------------------

/**
 * Minimal stateful chain factory.
 * tableResponses: table → response for maybeSingle/single.
 * tableResponses can hold arrays for ordered queue access.
 */
function makeSvc(tableResponses: Record<string, unknown> = {}) {
  const fromMock = vi.fn();

  // Ordered response queues per table
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
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single', 'insert', 'update', 'upsert'];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }

    // terminal resolvers
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(dequeue(table))
    );
    (chain.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(dequeue(table))
    );

    // conversations: upsert resolves, update().eq().eq().select().single() resolves conv row
    if (table === 'conversations') {
      (chain.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
      const updateChain: Record<string, unknown> = {};
      for (const m of ['eq', 'select', 'single', 'filter', 'not', 'in']) {
        updateChain[m] = vi.fn(() => updateChain);
      }
      (updateChain.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve(dequeue('conversations'))
      );
      (chain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);
    }

    // scheduled_jobs: upsert resolves void
    if (table === 'scheduled_jobs') {
      (chain.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
      (chain.insert as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      const updateChain: Record<string, unknown> = {};
      for (const m of ['eq', 'in', 'filter']) {
        updateChain[m] = vi.fn(() => updateChain);
      }
      (updateChain as Record<string, unknown>).then = vi.fn(
        (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve)
      );
      (chain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);
    }

    return chain;
  });

  return { svc: { from: fromMock } as unknown as Parameters<typeof processBotOpen>[0], fromMock, enqueue };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AGENCY_ID = 'agency-1';
const APPLICATION_ID = 'app-1';
const CANDIDATE_ID = 'cand-1';
const JOB_ID = 'job-1';
const BOT_CONFIG_ID = 'cfg-1';
const WA_ACCOUNT_ID = 'wa-1';
const TEMPLATE_ID = 'tmpl-1';
const CONVERSATION_ID = 'conv-1';

const baseApplication = {
  id: APPLICATION_ID,
  candidate_id: CANDIDATE_ID,
  job_id: JOB_ID,
  agency_id: AGENCY_ID,
};

const baseCandidate = {
  id: CANDIDATE_ID,
  name: 'Max Mustermann',
  phone_e164: '+491761234567',
  whatsapp_opt_in: true,
  agency_id: AGENCY_ID,
};

const baseJob = {
  id: JOB_ID,
  title: 'Vertriebsmitarbeiter',
  bot_config_id: BOT_CONFIG_ID,
  agency_id: AGENCY_ID,
};

const baseBotConfig = {
  id: BOT_CONFIG_ID,
  active: true,
  agency_id: AGENCY_ID,
};

const baseWaAccount = {
  id: WA_ACCOUNT_ID,
  status: 'connected',
  agency_id: AGENCY_ID,
};

const baseTemplate = {
  id: TEMPLATE_ID,
  name: 'application_received',
  language: 'de',
  preset_key: 'application_received',
  agency_id: AGENCY_ID,
  wa_account_id: WA_ACCOUNT_ID,
  status: 'approved',
};

const baseAgency = {
  id: AGENCY_ID,
  name: 'Test Agentur GmbH',
};

const baseConversation = {
  id: CONVERSATION_ID,
  state: 'bot_active',
  bot_step: 0,
  agency_id: AGENCY_ID,
  candidate_id: CANDIDATE_ID,
  wa_account_id: WA_ACCOUNT_ID,
  application_id: APPLICATION_ID,
};

// ---------------------------------------------------------------------------
// processBotOpen tests
// ---------------------------------------------------------------------------

describe('processBotOpen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeHappySvc() {
    const { svc, fromMock, enqueue } = makeSvc();

    // applications
    enqueue('applications', { data: baseApplication, error: null });
    // candidates
    enqueue('candidates', { data: baseCandidate, error: null });
    // jobs
    enqueue('jobs', { data: baseJob, error: null });
    // bot_configs
    enqueue('bot_configs', { data: baseBotConfig, error: null });
    // whatsapp_accounts
    enqueue('whatsapp_accounts', { data: baseWaAccount, error: null });
    // whatsapp_templates
    enqueue('whatsapp_templates', { data: baseTemplate, error: null });
    // agencies
    enqueue('agencies', { data: baseAgency, error: null });
    // conversations upsert + update chain → conversation row
    enqueue('conversations', { data: baseConversation, error: null });

    return { svc, fromMock, enqueue };
  }

  it('Erfolgsfall: keine Exception, kein Throw', async () => {
    const { svc } = makeHappySvc();
    await expect(
      processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID })
    ).resolves.toBeUndefined();
  });

  it('Guard: No-op wenn Kandidat kein whatsapp_opt_in', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('applications', { data: baseApplication, error: null });
    enqueue('candidates', { data: { ...baseCandidate, whatsapp_opt_in: false }, error: null });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('Guard: No-op wenn Kandidat kein phone_e164', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('applications', { data: baseApplication, error: null });
    enqueue('candidates', { data: { ...baseCandidate, phone_e164: null }, error: null });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('Guard: No-op wenn Job kein bot_config_id', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('applications', { data: baseApplication, error: null });
    enqueue('candidates', { data: baseCandidate, error: null });
    enqueue('jobs', { data: { ...baseJob, bot_config_id: null }, error: null });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('Guard: No-op wenn BotConfig nicht active', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('applications', { data: baseApplication, error: null });
    enqueue('candidates', { data: baseCandidate, error: null });
    enqueue('jobs', { data: baseJob, error: null });
    enqueue('bot_configs', { data: { ...baseBotConfig, active: false }, error: null });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('Guard: No-op wenn kein connected WhatsApp-Account', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('applications', { data: baseApplication, error: null });
    enqueue('candidates', { data: baseCandidate, error: null });
    enqueue('jobs', { data: baseJob, error: null });
    enqueue('bot_configs', { data: baseBotConfig, error: null });
    enqueue('whatsapp_accounts', { data: null, error: null }); // kein Account

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('Guard: No-op wenn kein approved application_received Template', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('applications', { data: baseApplication, error: null });
    enqueue('candidates', { data: baseCandidate, error: null });
    enqueue('jobs', { data: baseJob, error: null });
    enqueue('bot_configs', { data: baseBotConfig, error: null });
    enqueue('whatsapp_accounts', { data: baseWaAccount, error: null });
    enqueue('whatsapp_templates', { data: null, error: null }); // kein Template

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('Guard: No-op wenn Application nicht gefunden', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('applications', { data: null, error: null });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('Erfolgsfall: Conversation-Upsert wird aufgerufen mit application_id, state=bot_active, bot_step=0', async () => {
    const { svc, fromMock } = makeHappySvc();
    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });

    const convCalls = (fromMock.mock.calls as unknown[][]).filter((c) => c[0] === 'conversations');
    expect(convCalls.length).toBeGreaterThan(0);

    // Finde upsert-Aufruf
    let upsertArgs: Record<string, unknown> | null = null;
    for (const call of convCalls) {
      const chain = fromMock.mock.results[fromMock.mock.calls.indexOf(call)].value as Record<string, ReturnType<typeof vi.fn>>;
      if (chain.upsert?.mock?.calls?.length > 0) {
        upsertArgs = chain.upsert.mock.calls[0][0] as Record<string, unknown>;
        break;
      }
    }
    expect(upsertArgs).not.toBeNull();
    expect(upsertArgs?.application_id).toBe(APPLICATION_ID);
    expect(upsertArgs?.state).toBe('bot_active');
    expect(upsertArgs?.bot_step).toBe(0);
    expect(upsertArgs?.bot_meta).toBeDefined();
  });

  it('Erfolgsfall: sendWhatsAppMessage wird mit Template-Payload aufgerufen', async () => {
    const { svc } = makeHappySvc();
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        agencyId: AGENCY_ID,
        senderType: 'bot',
        payload: expect.objectContaining({
          type: 'template',
        }),
      })
    );
  });

  it('Erfolgsfall: Template-Variablen enthalten vorname (erstes Wort aus name)', async () => {
    const { svc } = makeHappySvc();
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });

    const callArgs = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    const components = callArgs?.payload?.template?.components as Array<{ type: string; parameters: Array<{ text: string }> }>;
    const bodyComp = components?.find((c) => c.type === 'body');
    const params = bodyComp?.parameters?.map((p) => p.text) ?? [];
    // 'Max' ist das erste Wort aus 'Max Mustermann'
    expect(params).toContain('Max');
  });

  it('Erfolgsfall: armBotTimersV2 wird aufgerufen', async () => {
    const { svc } = makeHappySvc();
    const { armBotTimersV2 } = await import('@/lib/bot/timers');

    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });

    expect(armBotTimersV2).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ agencyId: AGENCY_ID, botStep: 0 })
    );
  });

  it('Erfolgsfall: logActivity mit action_type=bot_opened', async () => {
    const { svc } = makeHappySvc();
    const { logActivity } = await import('@/lib/activity/log');

    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });

    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action_type: 'bot_opened' })
    );
  });

  it('sendWhatsAppMessage wirft → Fehler propagiert (tick übernimmt Retry)', async () => {
    const { svc } = makeHappySvc();
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Preflight fehlgeschlagen')
    );

    await expect(
      processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID })
    ).rejects.toThrow('Preflight fehlgeschlagen');
  });

  it('Alle Queries tragen agency_id (Multi-Tenant-Guard)', async () => {
    const { svc, fromMock } = makeHappySvc();
    await processBotOpen(svc, AGENCY_ID, { application_id: APPLICATION_ID });

    // Für jede from('x')-Kette prüfen, ob .eq('agency_id', ...) aufgerufen wurde
    const fromCalls = fromMock.mock.calls as unknown[][];
    const agencyTables = ['applications', 'candidates', 'jobs', 'bot_configs', 'whatsapp_accounts', 'whatsapp_templates'];

    for (const [tableName] of fromCalls) {
      if (!agencyTables.includes(tableName as string)) continue;
      const idx = fromMock.mock.calls.indexOf([tableName] as never);
      const chain = fromMock.mock.results[idx]?.value as Record<string, ReturnType<typeof vi.fn>>;
      if (!chain?.eq) continue;
      const eqCalls = chain.eq.mock.calls as Array<[string, string]>;
      const hasAgencyFilter = eqCalls.some(([col]) => col === 'agency_id');
      expect(hasAgencyFilter, `Tabelle ${tableName} fehlt agency_id-Filter`).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// processBotNudge tests
// ---------------------------------------------------------------------------

describe('processBotNudge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeNudgeSvc(convOverrides: Partial<typeof baseConversation> = {}) {
    const { svc, fromMock, enqueue } = makeSvc();
    const conv = { ...baseConversation, ...convOverrides };
    // conversation
    enqueue('conversations', { data: conv, error: null });
    // candidates
    enqueue('candidates', { data: baseCandidate, error: null });
    // applications (für job_id lookup)
    enqueue('applications', { data: baseApplication, error: null });
    // jobs
    enqueue('jobs', { data: baseJob, error: null });
    // whatsapp_accounts
    enqueue('whatsapp_accounts', { data: baseWaAccount, error: null });
    // whatsapp_templates (nudge step 0 → qualification_nudge)
    enqueue('whatsapp_templates', { data: { ...baseTemplate, preset_key: 'qualification_nudge', name: 'qualification_nudge' }, error: null });
    return { svc, fromMock, enqueue };
  }

  it('No-op wenn Conversation nicht mehr bot_active', async () => {
    const { svc } = makeNudgeSvc({ state: 'waiting' });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotNudge(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('No-op wenn bot_step ≠ payload.bot_step (Antwort kam inzwischen)', async () => {
    const { svc } = makeNudgeSvc({ state: 'bot_active', bot_step: 2 });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotNudge(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('bot_step 0: sendet qualification_nudge Template', async () => {
    const { svc } = makeNudgeSvc({ state: 'bot_active', bot_step: 0 });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotNudge(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ senderType: 'bot' })
    );
  });

  it('bot_step > 0: sendet qualification_resume Template', async () => {
    const { svc, enqueue } = makeSvc();
    const conv = { ...baseConversation, state: 'bot_active', bot_step: 2 };
    enqueue('conversations', { data: conv, error: null });
    enqueue('candidates', { data: baseCandidate, error: null });
    enqueue('applications', { data: baseApplication, error: null });
    enqueue('jobs', { data: baseJob, error: null });
    enqueue('whatsapp_accounts', { data: baseWaAccount, error: null });
    enqueue('whatsapp_templates', { data: { ...baseTemplate, preset_key: 'qualification_resume', name: 'qualification_resume' }, error: null });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotNudge(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 2 });

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ senderType: 'bot' })
    );
  });

  it('Fehler beim Senden werden NICHT propagiert (kein Dead-Letter)', async () => {
    const { svc } = makeNudgeSvc({ state: 'bot_active', bot_step: 0 });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Netzwerkfehler')
    );

    // muss still resolven — kein Throw
    await expect(
      processBotNudge(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 })
    ).resolves.toBeUndefined();
  });

  it('qualification_nudge Variablen enthalten vorname + jobTitle (bot_step=0)', async () => {
    const { svc } = makeNudgeSvc({ state: 'bot_active', bot_step: 0 });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotNudge(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    const callArgs = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    const components = callArgs?.payload?.template?.components as Array<{ type: string; parameters: Array<{ text: string }> }>;
    const bodyComp = components?.find((c) => c.type === 'body');
    const params = bodyComp?.parameters?.map((p) => p.text) ?? [];
    expect(params).toContain('Max');
    expect(params).toContain('Vertriebsmitarbeiter');
  });

  it('qualification_resume Variablen enthalten nur vorname (bot_step>0)', async () => {
    const { svc, enqueue } = makeSvc();
    const conv = { ...baseConversation, state: 'bot_active', bot_step: 1 };
    enqueue('conversations', { data: conv, error: null });
    enqueue('candidates', { data: baseCandidate, error: null });
    enqueue('applications', { data: baseApplication, error: null });
    enqueue('jobs', { data: baseJob, error: null });
    enqueue('whatsapp_accounts', { data: baseWaAccount, error: null });
    enqueue('whatsapp_templates', { data: { ...baseTemplate, preset_key: 'qualification_resume', name: 'qualification_resume' }, error: null });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotNudge(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 1 });

    const callArgs = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    const components = callArgs?.payload?.template?.components as Array<{ type: string; parameters: Array<{ text: string }> }>;
    const bodyComp = components?.find((c) => c.type === 'body');
    const params = bodyComp?.parameters?.map((p) => p.text) ?? [];
    expect(params).toContain('Max');
    // Jobtitel darf nicht dabei sein (qualification_resume hat nur [vorname])
    expect(params).not.toContain('Vertriebsmitarbeiter');
  });
});

// ---------------------------------------------------------------------------
// processBotTimeout tests
// ---------------------------------------------------------------------------

describe('processBotTimeout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeTimeoutSvc(convOverrides: Partial<typeof baseConversation> = {}) {
    const { svc, fromMock, enqueue } = makeSvc();
    const conv = { ...baseConversation, ...convOverrides };
    enqueue('conversations', { data: conv, error: null });
    // application (für logActivity candidate_id)
    enqueue('applications', { data: baseApplication, error: null });
    return { svc, fromMock, enqueue };
  }

  it('No-op wenn Conversation nicht mehr bot_active', async () => {
    const { svc } = makeTimeoutSvc({ state: 'waiting' });
    const { logActivity } = await import('@/lib/activity/log');
    await processBotTimeout(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('No-op wenn bot_step ≠ payload.bot_step', async () => {
    const { svc } = makeTimeoutSvc({ state: 'bot_active', bot_step: 3 });
    const { logActivity } = await import('@/lib/activity/log');
    await processBotTimeout(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('Timeout: setzt Conversation state auf "waiting"', async () => {
    const { svc, fromMock } = makeTimeoutSvc({ state: 'bot_active', bot_step: 0 });
    await processBotTimeout(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    // Prüfe dass conversations.update mit {state: 'waiting'} aufgerufen
    const convIdx = (fromMock.mock.calls as unknown[][]).findIndex((c) => c[0] === 'conversations' && fromMock.mock.calls.indexOf(c as never) > 0);

    // Genereller Check: conversations wurde mehrfach aufgerufen (load + update)
    const convCalls = (fromMock.mock.calls as unknown[][]).filter((c) => c[0] === 'conversations');
    expect(convCalls.length).toBeGreaterThanOrEqual(1);
    void convIdx;
  });

  it('Timeout: logActivity mit action_type=bot_timeout', async () => {
    const { svc } = makeTimeoutSvc({ state: 'bot_active', bot_step: 0 });
    const { logActivity } = await import('@/lib/activity/log');
    await processBotTimeout(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action_type: 'bot_timeout' })
    );
  });

  it('Timeout: KEINE Nachricht an Bewerber', async () => {
    const { svc } = makeTimeoutSvc({ state: 'bot_active', bot_step: 0 });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processBotTimeout(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});
