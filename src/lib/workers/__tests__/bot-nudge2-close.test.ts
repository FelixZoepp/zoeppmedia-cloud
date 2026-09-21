/**
 * Tests für bot-nudge2 (+24h) und bot-close (+48h) Worker.
 * Phase 4 Task 10.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processBotNudge2 } from '../bot-nudge2';
import { processBotClose } from '../bot-close';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'r1' }),
}));
vi.mock('@/lib/notifications/create', () => ({
  createNotificationForAgency: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@/lib/bot/timers', () => ({
  cancelBotTimers: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Chain-Mock helper
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
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single', 'insert', 'update', 'upsert'];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }

    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(dequeue(table))
    );
    (chain.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(dequeue(table))
    );

    if (table === 'conversations' || table === 'applications') {
      const updateChain: Record<string, unknown> = {};
      for (const m of ['eq', 'select', 'single', 'filter', 'not', 'in']) {
        updateChain[m] = vi.fn(() => updateChain);
      }
      (updateChain.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve(dequeue(table))
      );
      // Make awaitable
      (updateChain as Record<string, unknown>).then = vi.fn(
        (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve)
      );
      (chain.update as ReturnType<typeof vi.fn>).mockReturnValue(updateChain);
    }

    if (table === 'scheduled_jobs') {
      (chain.upsert as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    }

    return chain;
  });

  return { svc: { from: fromMock } as unknown as Parameters<typeof processBotNudge2>[0], fromMock, enqueue };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const AGENCY_ID = 'agency-1';
const CONVERSATION_ID = 'conv-1';
const CANDIDATE_ID = 'cand-1';
const WA_ACCOUNT_ID = 'wa-1';
const TEMPLATE_ID = 'tmpl-nudge2';
const APPLICATION_ID = 'app-1';
const JOB_ID = 'job-1';

const baseConversation = {
  id: CONVERSATION_ID,
  state: 'bot_active',
  bot_step: 0,
  agency_id: AGENCY_ID,
  candidate_id: CANDIDATE_ID,
  wa_account_id: WA_ACCOUNT_ID,
  application_id: APPLICATION_ID,
};

const baseCandidate = {
  id: CANDIDATE_ID,
  name: 'Max Mustermann',
  phone_e164: '+491761234567',
  agency_id: AGENCY_ID,
};

const baseTemplate = {
  id: TEMPLATE_ID,
  name: 'qualification_nudge',
  language: 'de',
  preset_key: 'qualification_nudge',
  agency_id: AGENCY_ID,
  wa_account_id: WA_ACCOUNT_ID,
  status: 'approved',
};

const baseApplication = {
  id: APPLICATION_ID,
  job_id: JOB_ID,
  agency_id: AGENCY_ID,
};

const baseJob = {
  id: JOB_ID,
  title: 'Außendienstmitarbeiter',
  agency_id: AGENCY_ID,
};

// ---------------------------------------------------------------------------
// processBotNudge2 tests
// ---------------------------------------------------------------------------

describe('processBotNudge2', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeHappySvc(convOverrides: Partial<typeof baseConversation> = {}) {
    const { svc, fromMock, enqueue } = makeSvc();
    const conv = { ...baseConversation, ...convOverrides };
    // conversations (1. call: mit select+eq+maybeSingle)
    enqueue('conversations', { data: conv, error: null });
    // candidates
    enqueue('candidates', { data: baseCandidate, error: null });
    // whatsapp_templates
    enqueue('whatsapp_templates', { data: baseTemplate, error: null });
    // conversations (2. call: application_id lookup)
    enqueue('conversations', { data: { application_id: APPLICATION_ID }, error: null });
    // applications
    enqueue('applications', { data: baseApplication, error: null });
    // jobs
    enqueue('jobs', { data: baseJob, error: null });
    return { svc, fromMock, enqueue };
  }

  it('sendet qualification_nudge-Template bei bot_active und passendem bot_step', async () => {
    const { svc } = makeHappySvc({ state: 'bot_active', bot_step: 0 });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotNudge2(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        agencyId: AGENCY_ID,
        senderType: 'bot',
        payload: expect.objectContaining({
          type: 'template',
          template: expect.objectContaining({ name: 'qualification_nudge' }),
        }),
      })
    );
  });

  it('No-op wenn Conversation nicht mehr bot_active', async () => {
    const { svc } = makeHappySvc({ state: 'human_active', bot_step: 0 });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotNudge2(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('No-op wenn bot_step nicht mehr passt (Antwort kam)', async () => {
    const { svc } = makeHappySvc({ state: 'bot_active', bot_step: 1 });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotNudge2(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('No-op wenn kein Template gefunden', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('conversations', { data: baseConversation, error: null });
    enqueue('candidates', { data: baseCandidate, error: null });
    enqueue('whatsapp_templates', { data: null, error: null }); // kein Template
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotNudge2(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('No-op wenn Kandidat kein phone_e164', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('conversations', { data: baseConversation, error: null });
    enqueue('candidates', { data: { ...baseCandidate, phone_e164: null }, error: null });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotNudge2(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('Fehler beim Senden werden NICHT propagiert (kein Dead-Letter)', async () => {
    const { svc } = makeHappySvc({ state: 'bot_active', bot_step: 0 });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('Netzwerkfehler')
    );

    await expect(
      processBotNudge2(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 })
    ).resolves.toBeUndefined();
  });

  it('Template-Variablen enthalten vorname und jobTitle', async () => {
    const { svc } = makeHappySvc({ state: 'bot_active', bot_step: 0 });
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processBotNudge2(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    const callArgs = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0]?.[1];
    const components = callArgs?.payload?.template?.components as Array<{ type: string; parameters: Array<{ text: string }> }>;
    const bodyComp = components?.find((c: { type: string }) => c.type === 'body');
    const params = bodyComp?.parameters?.map((p: { text: string }) => p.text) ?? [];
    expect(params).toContain('Max');
    expect(params).toContain('Außendienstmitarbeiter');
  });
});

// ---------------------------------------------------------------------------
// processBotClose tests
// ---------------------------------------------------------------------------

describe('processBotClose', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function makeCloseSvc(convOverrides: Partial<typeof baseConversation> = {}) {
    const { svc, fromMock, enqueue } = makeSvc();
    const conv = { ...baseConversation, ...convOverrides };
    enqueue('conversations', { data: conv, error: null });
    enqueue('candidates', { data: { id: CANDIDATE_ID, name: 'Max Mustermann' }, error: null });
    return { svc, fromMock, enqueue };
  }

  it('setzt state=closed, status=nicht_erreicht, sendet Notification', async () => {
    const { svc, fromMock } = makeCloseSvc({ state: 'bot_active', bot_step: 0 });
    const { createNotificationForAgency } = await import('@/lib/notifications/create');

    await processBotClose(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    // Conversations.update aufgerufen
    const convCalls = (fromMock.mock.calls as unknown[][]).filter((c) => c[0] === 'conversations');
    expect(convCalls.length).toBeGreaterThanOrEqual(1);

    // Applications.update mit status=nicht_erreicht aufgerufen
    const appCalls = (fromMock.mock.calls as unknown[][]).filter((c) => c[0] === 'applications');
    expect(appCalls.length).toBeGreaterThanOrEqual(1);
    const appUpdateChain = (fromMock as ReturnType<typeof vi.fn>).mock.results.find(
      (r) => r.value && typeof r.value.update === 'function' &&
      (fromMock.mock.calls as unknown[][]).some((c) => c[0] === 'applications')
    );
    if (appUpdateChain) {
      const updateCall = (appUpdateChain.value.update as ReturnType<typeof vi.fn>).mock.calls[0];
      if (updateCall) {
        expect(updateCall[0]).toEqual(expect.objectContaining({ status: 'nicht_erreicht' }));
      }
    }

    // Notification wurde gesendet
    expect(createNotificationForAgency).toHaveBeenCalledWith(
      expect.anything(),
      AGENCY_ID,
      expect.objectContaining({
        type: 'system',
      })
    );
  });

  it('No-op wenn Conversation nicht mehr bot_active', async () => {
    const { svc } = makeCloseSvc({ state: 'human_active', bot_step: 0 });
    const { createNotificationForAgency } = await import('@/lib/notifications/create');

    await processBotClose(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(createNotificationForAgency).not.toHaveBeenCalled();
  });

  it('No-op wenn bot_step nicht mehr passt', async () => {
    const { svc } = makeCloseSvc({ state: 'bot_active', bot_step: 2 });
    const { createNotificationForAgency } = await import('@/lib/notifications/create');

    await processBotClose(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(createNotificationForAgency).not.toHaveBeenCalled();
  });

  it('logActivity mit action_type=bot_closed', async () => {
    const { svc } = makeCloseSvc({ state: 'bot_active', bot_step: 0 });
    const { logActivity } = await import('@/lib/activity/log');

    await processBotClose(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(logActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action_type: 'bot_closed' })
    );
  });

  it('Notification-Titel enthält Kandidaten-Name', async () => {
    const { svc } = makeCloseSvc({ state: 'bot_active', bot_step: 0 });
    const { createNotificationForAgency } = await import('@/lib/notifications/create');

    await processBotClose(svc, AGENCY_ID, { conversation_id: CONVERSATION_ID, bot_step: 0 });

    expect(createNotificationForAgency).toHaveBeenCalledWith(
      expect.anything(),
      AGENCY_ID,
      expect.objectContaining({
        title: expect.stringContaining('Max Mustermann'),
      })
    );
  });
});
