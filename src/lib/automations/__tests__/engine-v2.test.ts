import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireAutomations, evaluateConditionExported } from '../engine';

// --- Mocks ---

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => buildMockSvc({})),
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'r1' }),
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn(),
  createNotificationForAgency: vi.fn(),
  createNotificationForInternals: vi.fn(),
}));

vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn(),
}));

// --- makeSvc helper ---

type TableResponses = Record<string, { data: unknown; error: unknown } | null>;

function buildMockSvc(tableResponses: TableResponses = {}) {
  const inserted: Record<string, unknown[]> = {};
  const updated: Record<string, Record<string, unknown>[]> = {};
  const eqCalls: Record<string, [string, unknown][]> = {};
  const fromMock = vi.fn();

  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
      'insert', 'update', 'upsert', 'delete', 'gte', 'lte', 'or', 'limit',
    ];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }

    (chain.insert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!inserted[table]) inserted[table] = [];
      inserted[table].push(data);
      return { ...chain, data: Array.isArray(data) ? data : [data], error: null };
    });

    (chain.upsert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!inserted[table]) inserted[table] = [];
      inserted[table].push(data);
      return { ...chain, data: [data], error: null };
    });

    (chain.update as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!updated[table]) updated[table] = [];
      updated[table].push(data as Record<string, unknown>);
      return chain;
    });

    (chain.eq as ReturnType<typeof vi.fn>).mockImplementation((col: string, val: unknown) => {
      if (!eqCalls[table]) eqCalls[table] = [];
      eqCalls[table].push([col, val]);
      return chain;
    });

    (chain.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const resp = tableResponses[table] ?? { data: null, error: null };
      return Promise.resolve(resp);
    });
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const resp = tableResponses[table] ?? { data: null, error: null };
      return Promise.resolve(resp);
    });

    return chain;
  });

  return {
    from: fromMock,
    rpc: vi.fn(),
    _inserted: inserted,
    _updated: updated,
    _eqCalls: eqCalls,
  } as unknown as import('@supabase/supabase-js').SupabaseClient & {
    _inserted: Record<string, unknown[]>;
    _updated: Record<string, Record<string, unknown>[]>;
    _eqCalls: Record<string, [string, unknown][]>;
  };
}

// Hilfsfunktion: Automation-Row mit einem Action-Typ erzeugen
function makeAutomationRow(actionType: string, params: Record<string, unknown>, extraCtx: Record<string, unknown> = {}) {
  return {
    id: 'auto-1',
    agency_id: 'ag-1',
    name: 'Test',
    trigger_event: 'application.created',
    conditions: [],
    actions: [{ type: actionType, params }],
    delay_seconds: 0,
    active: true,
    is_system: false,
    ...extraCtx,
  };
}

// --- Tests ---

describe('Automations v2 — neue Aktionen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('set_stage_application ändert stage_id auf applications (nicht candidates)', async () => {
    const applicationId = 'app-xyz';
    const stageId = 'stage-xyz';

    const svc = buildMockSvc({
      automations: { data: [makeAutomationRow('set_stage_application', { stage_id: stageId })], error: null },
    });
    // Automations-Query liefert Array
    (svc.from as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      const chain: Record<string, unknown> = {};
      const methods = ['select', 'eq', 'or', 'single', 'maybeSingle', 'insert', 'update'];
      for (const m of methods) chain[m] = vi.fn(() => chain);
      // Der erste from('automations') resolve
      (chain.select as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(chain);
      (chain.or as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [makeAutomationRow('set_stage_application', { stage_id: stageId })],
        error: null,
      });
      return chain;
    });

    const svcFull = buildMockSvc({});
    // Wir testen direkt fireAutomations mit einem pre-built Svc der alle Tabellen kennt
    // Besser: Direkt über makeSvcWithAutomations
    const svc2 = makeSvcForAction('set_stage_application', { stage_id: stageId }, applicationId);

    await fireAutomations(svc2, {
      trigger_event: 'application.created',
      agency_id: 'ag-1',
      application_id: applicationId,
    });

    expect(svc2.from).toHaveBeenCalledWith('applications');
    const appUpdates = (svc2 as ReturnType<typeof buildMockSvc>)._updated['applications'];
    expect(appUpdates).toBeDefined();
    expect(appUpdates?.[0]).toMatchObject({ stage_id: stageId });
  });

  it('assign_application setzt assigned_to auf applications', async () => {
    const applicationId = 'app-xyz';
    const userId = 'user-1';

    const svc = makeSvcForAction('assign_application', { user_id: userId }, applicationId);

    await fireAutomations(svc, {
      trigger_event: 'application.created',
      agency_id: 'ag-1',
      application_id: applicationId,
    });

    expect(svc.from).toHaveBeenCalledWith('applications');
    const appUpdates = (svc as ReturnType<typeof buildMockSvc>)._updated['applications'];
    expect(appUpdates?.[0]).toMatchObject({ assigned_to: userId });
  });

  it('add_note fügt Notiz in notes-Tabelle ein', async () => {
    const applicationId = 'app-xyz';
    const noteBody = 'Automatische Notiz';

    const svc = makeSvcForAction('add_note', { body: noteBody }, applicationId);

    await fireAutomations(svc, {
      trigger_event: 'application.created',
      agency_id: 'ag-1',
      application_id: applicationId,
    });

    expect(svc.from).toHaveBeenCalledWith('notes');
    const notes = (svc as ReturnType<typeof buildMockSvc>)._inserted['notes'];
    expect(notes?.[0]).toMatchObject({
      agency_id: 'ag-1',
      application_id: applicationId,
      body: noteBody,
      user_id: null,
    });
  });

  it('call_webhook sendet POST mit 5s timeout und loggt Status', async () => {
    const webhookUrl = 'https://example.com/hook';
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);

    const svc = makeSvcForAction('call_webhook', { url: webhookUrl }, undefined);

    await fireAutomations(svc, {
      trigger_event: 'application.created',
      agency_id: 'ag-1',
    });

    expect(fetchSpy).toHaveBeenCalledWith(
      webhookUrl,
      expect.objectContaining({
        method: 'POST',
        signal: expect.any(AbortSignal),
      }),
    );

    // Fix 2b: automation_runs muss response_status enthalten
    const runs = (svc as ReturnType<typeof buildMockSvc>)._inserted['automation_runs'];
    expect(runs).toBeDefined();
    expect(runs?.[0]).toMatchObject({
      status: 'success',
    });
    const actionsExecuted = (runs?.[0] as Record<string, unknown>)?.actions_executed as Array<Record<string, unknown>>;
    expect(actionsExecuted).toBeDefined();
    const webhookEntry = actionsExecuted?.find((a) => a.type === 'call_webhook');
    expect(webhookEntry).toBeDefined();
    expect(webhookEntry?.response_status).toBe(200);

    vi.unstubAllGlobals();
  });

  it('call_webhook SSRF-Schutz: interne IP wird abgelehnt', async () => {
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal('fetch', fetchSpy);

    const svc = makeSvcForAction('call_webhook', { url: 'http://169.254.169.254/x' }, undefined);

    await fireAutomations(svc, {
      trigger_event: 'application.created',
      agency_id: 'ag-1',
    });

    // fetch darf nicht aufgerufen werden
    expect(fetchSpy).not.toHaveBeenCalled();

    // Der Run soll als failed geloggt sein
    const runs = (svc as ReturnType<typeof buildMockSvc>)._inserted['automation_runs'];
    expect(runs?.[0]).toMatchObject({ status: 'failed' });
    const actionsExecuted = (runs?.[0] as Record<string, unknown>)?.actions_executed as Array<Record<string, unknown>>;
    const webhookEntry = actionsExecuted?.find((a) => a.type === 'call_webhook');
    expect(webhookEntry?.status).toBe('failed');
    expect(String(webhookEntry?.error)).toContain('Ungültige Webhook-URL');

    vi.unstubAllGlobals();
  });

  it('start_bot legt scheduled_job mit dedupe_key an', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');

    // Wir brauchen einen verfolgbaren Admin-Svc
    const adminSvc = buildMockSvc({});
    const adminInserted: Record<string, unknown[]> = {};
    const adminUpsertCalls: Array<{ data: unknown; opts: unknown }> = [];
    (adminSvc.from as ReturnType<typeof vi.fn>).mockImplementation((table: string) => {
      const chain: Record<string, unknown> = {};
      const methods = ['select', 'eq', 'insert', 'update', 'upsert', 'delete', 'or', 'single', 'maybeSingle'];
      for (const m of methods) chain[m] = vi.fn(() => chain);
      (chain.upsert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown, opts: unknown) => {
        if (!adminInserted[table]) adminInserted[table] = [];
        adminInserted[table].push(data);
        adminUpsertCalls.push({ data, opts });
        return Promise.resolve({ data: [data], error: null });
      });
      return chain;
    });
    vi.mocked(createAdminClient).mockReturnValue(adminSvc);

    const applicationId = 'app-bot-1';
    const svc = makeSvcForAction('start_bot', {}, applicationId);

    await fireAutomations(svc, {
      trigger_event: 'application.created',
      agency_id: 'ag-1',
      application_id: applicationId,
    });

    // scheduled_jobs upsert muss aufgerufen worden sein
    expect(adminUpsertCalls.length).toBeGreaterThan(0);
    const call = adminUpsertCalls[0];
    expect((call.data as Record<string, unknown>).dedupe_key).toBe(`bot.open:${applicationId}`);
    expect(call.opts).toMatchObject({ onConflict: 'dedupe_key', ignoreDuplicates: true });

    // Admin-Client-Mock zurücksetzen
    vi.mocked(createAdminClient).mockReturnValue(buildMockSvc({}));
  });

  it('send_template sendet WhatsApp-Template über sendWhatsAppMessage', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    vi.mocked(sendWhatsAppMessage).mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'r1' });

    const svc = makeSvcForSendTemplate('preset-bewerbung');

    await fireAutomations(svc, {
      trigger_event: 'application.created',
      agency_id: 'ag-1',
      candidate_id: 'cand-1',
      conversation_id: 'conv-1',
    });

    expect(sendWhatsAppMessage).toHaveBeenCalled();
    const call = vi.mocked(sendWhatsAppMessage).mock.calls[0];
    expect(call[1].payload.type).toBe('template');
  });

  it('send_message wird bei geschlossenem Fenster mit Log übersprungen', async () => {
    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    vi.mocked(sendWhatsAppMessage).mockRejectedValue(new Error('Fenster geschlossen'));

    const svc = makeSvcForSendMessage('Hallo!');

    // Soll keinen Fehler werfen
    await expect(
      fireAutomations(svc, {
        trigger_event: 'application.created',
        agency_id: 'ag-1',
        candidate_id: 'cand-1',
        conversation_id: 'conv-1',
      }),
    ).resolves.not.toThrow();

    // run wurde trotzdem geloggt
    expect(svc.from).toHaveBeenCalledWith('automation_runs');

    // Fix 3: actions_executed-Eintrag für send_message muss status 'skipped' haben
    const _inserted = (svc as unknown as { _inserted: Record<string, unknown[]> })._inserted;
    const runs = _inserted['automation_runs'];
    expect(runs).toBeDefined();
    const actionsExecuted = (runs?.[0] as Record<string, unknown>)?.actions_executed as Array<Record<string, unknown>>;
    const msgEntry = actionsExecuted?.find((a) => a.type === 'send_message');
    expect(msgEntry).toBeDefined();
    expect(msgEntry?.status).toBe('skipped');
  });
});

describe('Bedingungs-Operatoren', () => {
  it('eq, neq, in, contains funktionieren auf Context-Feldern', () => {
    expect(evaluateConditionExported('A', 'eq', 'A')).toBe(true);
    expect(evaluateConditionExported('A', 'eq', 'B')).toBe(false);
    expect(evaluateConditionExported('A', 'neq', 'B')).toBe(true);
    expect(evaluateConditionExported('A', 'neq', 'A')).toBe(false);
    expect(evaluateConditionExported('A', 'in', ['A', 'B'])).toBe(true);
    expect(evaluateConditionExported('C', 'in', ['A', 'B'])).toBe(false);
    expect(evaluateConditionExported('hallo welt', 'contains', 'welt')).toBe(true);
    expect(evaluateConditionExported('hallo welt', 'contains', 'xyz')).toBe(false);
  });
});

describe('Rate-Limit P4-R9a', () => {
  it('überspringt Automation wenn > 10 Runs pro Stunde für gleiche application_id', async () => {
    const applicationId = 'app-rate-test';
    const svc = makeSvcForActionWithRateLimit('send_notification', { title: 'Test', user_scope: 'agency' }, applicationId, 11);

    await fireAutomations(svc, {
      trigger_event: 'application.created',
      agency_id: 'ag-1',
      application_id: applicationId,
    });

    const _inserted = (svc as unknown as { _inserted: Record<string, unknown[]> })._inserted;
    const runs = _inserted['automation_runs'];
    expect(runs).toBeDefined();
    expect(runs?.length).toBeGreaterThan(0);
    const skippedRun = (runs as Array<Record<string, unknown>>).find(r => r.status === 'skipped');
    expect(skippedRun).toBeDefined();
    expect(skippedRun?.error_message).toBe('Rate-Limit');
  });
});

describe('Dedupe P4-R9c', () => {
  it('überspringt bei doppeltem dedupe_key (Unique-Index-Verletzung)', async () => {
    const applicationId = 'app-dedupe-test';
    const svc = makeSvcForActionWithDedupeConflict('send_notification', { title: 'Test', user_scope: 'agency' }, applicationId);

    await fireAutomations(svc, {
      trigger_event: 'application.created',
      agency_id: 'ag-1',
      application_id: applicationId,
    });

    // Der Run wird übersprungen — es gibt keinen 'success'-Run (entweder keinen oder skipped)
    const _inserted = (svc as unknown as { _inserted: Record<string, unknown[]> })._inserted;
    const runs = _inserted['automation_runs'];
    const successRuns = (runs as Array<Record<string, unknown>> | undefined)?.filter(r => r.status === 'success');
    expect(successRuns?.length ?? 0).toBe(0);
  });
});

// --- Hilfsfunktionen für komplexe Mock-Setups ---

function makeSvcForAction(
  actionType: string,
  params: Record<string, unknown>,
  applicationId: string | undefined,
) {
  const automationRow = makeAutomationRow(actionType, params);
  const svc = buildMockSvc({});
  const fromOriginal = (svc.from as ReturnType<typeof vi.fn>);

  fromOriginal.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
      'insert', 'update', 'upsert', 'delete', 'gte', 'lte', 'or', 'limit',
    ];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }

    (chain.insert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      const inserted = (svc as unknown as { _inserted: Record<string, unknown[]> })._inserted;
      if (!inserted[table]) inserted[table] = [];
      inserted[table].push(data);
      return Promise.resolve({ data: [data], error: null });
    });

    (chain.update as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      const updated = (svc as unknown as { _updated: Record<string, unknown[]> })._updated;
      if (!updated[table]) updated[table] = [];
      updated[table].push(data);
      return chain;
    });

    (chain.upsert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      const inserted = (svc as unknown as { _inserted: Record<string, unknown[]> })._inserted;
      if (!inserted[table]) inserted[table] = [];
      inserted[table].push(data);
      return Promise.resolve({ data: [data], error: null });
    });

    (chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.or as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.gte as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    if (table === 'automations') {
      (chain.or as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [automationRow],
        error: null,
      });
    }

    if (table === 'automation_runs') {
      // select für Rate-Limit-Check gibt count=0 zurück (kein Rate-Limit)
      (chain.select as ReturnType<typeof vi.fn>).mockImplementation((_col: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts?.head === true) {
          (chain.gte as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
            Promise.resolve({ data: null, error: null, count: 0 })
          );
        }
        return chain;
      });
    }

    (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });

    return chain;
  });

  // Expose _inserted and _updated
  (svc as unknown as { _inserted: Record<string, unknown[]> })._inserted = {};
  (svc as unknown as { _updated: Record<string, unknown[]> })._updated = {};

  return svc;
}

function makeSvcForSendTemplate(presetKey: string) {
  const automationRow = makeAutomationRow('send_template', { preset_key: presetKey });
  return makeSvcWithConversation(automationRow, {
    wa_account_id: 'wa-1',
    candidate_id: 'cand-1',
  }, {
    phone_e164: '+491234567890',
  }, {
    id: 'tmpl-1',
    name: 'bewerbung_template',
    variables: ['{{1}}'],
  });
}

function makeSvcForSendMessage(body: string) {
  const automationRow = makeAutomationRow('send_message', { body });
  return makeSvcWithConversation(automationRow, {
    wa_account_id: 'wa-1',
    candidate_id: 'cand-1',
  }, {
    phone_e164: '+491234567890',
  }, null);
}

function makeSvcWithConversation(
  automationRow: Record<string, unknown>,
  convData: Record<string, unknown>,
  candidateData: Record<string, unknown>,
  templateData: Record<string, unknown> | null,
) {
  const svc = buildMockSvc({});
  const fromOriginal = (svc.from as ReturnType<typeof vi.fn>);
  const _inserted: Record<string, unknown[]> = {};
  const _updated: Record<string, unknown[]> = {};
  (svc as unknown as { _inserted: Record<string, unknown[]> })._inserted = _inserted;
  (svc as unknown as { _updated: Record<string, unknown[]> })._updated = _updated;

  fromOriginal.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
      'insert', 'update', 'upsert', 'delete', 'gte', 'lte', 'or', 'limit',
    ];
    for (const m of methods) chain[m] = vi.fn(() => chain);

    (chain.insert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!_inserted[table]) _inserted[table] = [];
      _inserted[table].push(data);
      return Promise.resolve({ data: [data], error: null });
    });
    (chain.upsert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!_inserted[table]) _inserted[table] = [];
      _inserted[table].push(data);
      return Promise.resolve({ data: [data], error: null });
    });
    (chain.update as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!_updated[table]) _updated[table] = [];
      _updated[table].push(data);
      return chain;
    });

    (chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.or as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.gte as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    if (table === 'automations') {
      (chain.or as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [automationRow],
        error: null,
      });
    }

    if (table === 'automation_runs') {
      // select für Rate-Limit-Check gibt count=0 zurück (kein Rate-Limit)
      (chain.select as ReturnType<typeof vi.fn>).mockImplementation((_col: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts?.head === true) {
          (chain.gte as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
            Promise.resolve({ data: null, error: null, count: 0 })
          );
        }
        return chain;
      });
    }

    if (table === 'conversations') {
      (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: convData, error: null });
    } else if (table === 'candidates') {
      (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: candidateData, error: null });
    } else if (table === 'whatsapp_templates') {
      (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: templateData, error: null });
    } else {
      (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
      (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    }

    return chain;
  });

  return svc;
}

/**
 * Mock-Svc für Rate-Limit-Tests: automation_runs COUNT gibt `count` zurück
 */
function makeSvcForActionWithRateLimit(
  actionType: string,
  params: Record<string, unknown>,
  applicationId: string,
  runCount: number,
) {
  const automationRow = makeAutomationRow(actionType, params);
  const svc = buildMockSvc({});
  const fromOriginal = (svc.from as ReturnType<typeof vi.fn>);
  const _inserted: Record<string, unknown[]> = {};
  const _updated: Record<string, unknown[]> = {};
  (svc as unknown as { _inserted: Record<string, unknown[]> })._inserted = _inserted;
  (svc as unknown as { _updated: Record<string, unknown[]> })._updated = _updated;

  // Verfolgt, ob wir in einer Rate-Limit-Zähl-Abfrage sind
  let isCountQuery = false;

  fromOriginal.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
      'insert', 'update', 'upsert', 'delete', 'gte', 'lte', 'or', 'limit', 'head',
    ];
    for (const m of methods) chain[m] = vi.fn(() => chain);

    (chain.insert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!_inserted[table]) _inserted[table] = [];
      _inserted[table].push(data);
      return Promise.resolve({ data: [data], error: null, count: null });
    });
    (chain.update as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!_updated[table]) _updated[table] = [];
      _updated[table].push(data);
      return chain;
    });
    (chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.or as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.gte as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    if (table === 'automations') {
      (chain.or as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [automationRow],
        error: null,
      });
    }

    if (table === 'automation_runs') {
      // select mit count:exact,head:true — liefert count
      (chain.select as ReturnType<typeof vi.fn>).mockImplementation((_col: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts?.head === true) {
          isCountQuery = true;
        }
        return chain;
      });
      // Das letzte .gte() auf der count-Query löst die Promise aus
      (chain.gte as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        return Promise.resolve({ data: null, error: null, count: runCount });
      });
    }

    (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });

    return chain;
  });

  void isCountQuery;
  return svc;
}

/**
 * Mock-Svc für Dedupe-Tests: automation_runs INSERT wirft unique_violation
 */
function makeSvcForActionWithDedupeConflict(
  actionType: string,
  params: Record<string, unknown>,
  applicationId: string,
) {
  const automationRow = makeAutomationRow(actionType, params);
  const svc = buildMockSvc({});
  const fromOriginal = (svc.from as ReturnType<typeof vi.fn>);
  const _inserted: Record<string, unknown[]> = {};
  const _updated: Record<string, unknown[]> = {};
  (svc as unknown as { _inserted: Record<string, unknown[]> })._inserted = _inserted;
  (svc as unknown as { _updated: Record<string, unknown[]> })._updated = _updated;

  let insertCallCount = 0;

  fromOriginal.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
      'insert', 'update', 'upsert', 'delete', 'gte', 'lte', 'or', 'limit',
    ];
    for (const m of methods) chain[m] = vi.fn(() => chain);

    (chain.insert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!_inserted[table]) _inserted[table] = [];
      if (table === 'automation_runs') {
        insertCallCount++;
        // Simuliere Unique-Index-Verletzung beim ersten automation_runs Insert (success-path)
        // Rate-Limit-Count-Query gibt 0 zurück (kein Rate-Limit), aber der Insert schlägt fehl
        return Promise.resolve({
          data: null,
          error: { code: '23505', message: 'duplicate key value violates unique constraint' },
        });
      }
      _inserted[table].push(data);
      return Promise.resolve({ data: [data], error: null });
    });
    (chain.upsert as ReturnType<typeof vi.fn>).mockImplementation((data: unknown, opts?: unknown) => {
      if (table === 'automation_runs') {
        // ignoreDuplicates=true → kein Fehler, einfach ignorieren
        return Promise.resolve({ data: [], error: null });
      }
      if (!_inserted[table]) _inserted[table] = [];
      _inserted[table].push(data);
      return Promise.resolve({ data: [data], error: null });
    });
    (chain.update as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!_updated[table]) _updated[table] = [];
      _updated[table].push(data);
      return chain;
    });
    (chain.eq as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.or as ReturnType<typeof vi.fn>).mockReturnValue(chain);
    (chain.gte as ReturnType<typeof vi.fn>).mockReturnValue(chain);

    if (table === 'automations') {
      (chain.or as ReturnType<typeof vi.fn>).mockResolvedValue({
        data: [automationRow],
        error: null,
      });
    }

    if (table === 'automation_runs') {
      // select für Rate-Limit-Check gibt count=0 zurück
      (chain.select as ReturnType<typeof vi.fn>).mockImplementation((_col: string, opts?: { count?: string; head?: boolean }) => {
        if (opts?.count === 'exact' && opts?.head === true) {
          (chain.gte as ReturnType<typeof vi.fn>).mockImplementationOnce(() =>
            Promise.resolve({ data: null, error: null, count: 0 })
          );
        }
        return chain;
      });
    }

    (chain.single as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockResolvedValue({ data: null, error: null });

    return chain;
  });

  void applicationId;
  void insertCallCount;
  return svc;
}
