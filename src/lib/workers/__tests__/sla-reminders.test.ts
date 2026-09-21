/**
 * Tests für SLA-Reminder-Worker (Phase 4, Task 11).
 * TDD: Tests zuerst, dann Implementierung.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processSlaRecruiter24h,
  processSlaRecruiter48h,
  processDocumentsRequest,
} from '../sla-reminders';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotificationForAgency: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'r1' }),
}));

vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn() }));

// ---------------------------------------------------------------------------
// Chain-Mock helper (mit count-Unterstützung)
// ---------------------------------------------------------------------------

function makeSvc(tableResponses: Record<string, unknown> = {}) {
  const fromMock = vi.fn();
  const queues: Record<string, Array<{ data: unknown; count?: number | null; error: unknown }>> = {};

  function enqueue(table: string, resp: { data: unknown; count?: number | null; error: unknown }) {
    if (!queues[table]) queues[table] = [];
    queues[table].push(resp);
  }

  function dequeue(table: string): { data: unknown; count?: number | null; error: unknown } {
    if (queues[table] && queues[table].length > 0) return queues[table].shift()!;
    if (table in tableResponses) return tableResponses[table] as { data: unknown; count?: number | null; error: unknown };
    return { data: null, count: null, error: null };
  }

  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = [
      'select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
      'insert', 'update', 'upsert', 'delete', 'gte', 'lte', 'or', 'limit',
    ];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }

    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(dequeue(table))
    );
    (chain.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(dequeue(table))
    );
    // count-Abfragen (head:true) werden über die Chain aufgelöst
    // Wir überschreiben select so, dass bei { count } auch count zurückgegeben wird
    const origSelect = chain.select as ReturnType<typeof vi.fn>;
    origSelect.mockImplementation((_cols: unknown, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count && opts?.head) {
        // Gibt direkt ein Promise mit { count } zurück wenn chain terminiert wird
        const countChain: Record<string, unknown> = {};
        for (const m of methods) {
          countChain[m] = vi.fn(() => countChain);
        }
        // Resolve terminal — dequeue beim ersten await
        Object.defineProperty(countChain, 'then', {
          get() {
            const resp = dequeue(table);
            return (resolve: (v: unknown) => void) => resolve(resp);
          },
        });
        return countChain;
      }
      return chain;
    });

    return chain;
  });

  return {
    svc: { from: fromMock } as unknown as import('@supabase/supabase-js').SupabaseClient,
    fromMock,
    enqueue,
  };
}

// ---------------------------------------------------------------------------
// processSlaRecruiter24h
// ---------------------------------------------------------------------------

describe('processSlaRecruiter24h', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendet Notification wenn Stage unverändert (qualified) und keine ausgehende Nachricht', async () => {
    const { svc, enqueue } = makeSvc();

    // applications
    enqueue('applications', {
      data: { id: 'app-1', stage_id: 'stage-q', candidate_id: 'cand-1', assigned_to: 'user-1', updated_at: '2026-09-20T10:00:00Z' },
      error: null,
    });
    // pipeline_stages
    enqueue('pipeline_stages', {
      data: { stage_type: 'qualified' },
      error: null,
    });
    // conversations
    enqueue('conversations', {
      data: { id: 'conv-1' },
      error: null,
    });
    // messages count → 0 ausgehende
    enqueue('messages', { data: null, count: 0, error: null });
    // candidates
    enqueue('candidates', {
      data: { name: 'Max Müller' },
      error: null,
    });

    const { createNotification } = await import('@/lib/notifications/create');

    await processSlaRecruiter24h(svc, 'ag-1', { application_id: 'app-1' });

    expect(createNotification).toHaveBeenCalledOnce();
    const callArgs = (createNotification as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.type).toBe('sla_breach');
    expect(callArgs.title).toContain('24h');
    expect(callArgs.user_id).toBe('user-1');
  });

  it('No-op wenn Stage geändert wurde (nicht mehr qualified)', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('applications', {
      data: { id: 'app-1', stage_id: 'stage-i', candidate_id: 'cand-1', assigned_to: null, updated_at: '2026-09-20T10:00:00Z' },
      error: null,
    });
    enqueue('pipeline_stages', {
      data: { stage_type: 'interview' },
      error: null,
    });

    const { createNotification, createNotificationForAgency } = await import('@/lib/notifications/create');

    await processSlaRecruiter24h(svc, 'ag-1', { application_id: 'app-1' });

    expect(createNotification).not.toHaveBeenCalled();
    expect(createNotificationForAgency).not.toHaveBeenCalled();
  });

  it('No-op wenn ausgehende Nachricht existiert', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('applications', {
      data: { id: 'app-1', stage_id: 'stage-q', candidate_id: 'cand-1', assigned_to: null, updated_at: '2026-09-20T10:00:00Z' },
      error: null,
    });
    enqueue('pipeline_stages', { data: { stage_type: 'qualified' }, error: null });
    enqueue('conversations', { data: { id: 'conv-1' }, error: null });
    // messages count → 1 ausgehende Nachricht
    enqueue('messages', { data: null, count: 1, error: null });

    const { createNotification, createNotificationForAgency } = await import('@/lib/notifications/create');

    await processSlaRecruiter24h(svc, 'ag-1', { application_id: 'app-1' });

    expect(createNotification).not.toHaveBeenCalled();
    expect(createNotificationForAgency).not.toHaveBeenCalled();
  });

  it('sendet an Agentur wenn kein assigned_to vorhanden', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('applications', {
      data: { id: 'app-1', stage_id: 'stage-q', candidate_id: 'cand-1', assigned_to: null, updated_at: '2026-09-20T10:00:00Z' },
      error: null,
    });
    enqueue('pipeline_stages', { data: { stage_type: 'qualified' }, error: null });
    enqueue('conversations', { data: { id: 'conv-1' }, error: null });
    enqueue('messages', { data: null, count: 0, error: null });
    enqueue('candidates', { data: { name: 'Erika Mustermann' }, error: null });

    const { createNotificationForAgency } = await import('@/lib/notifications/create');

    await processSlaRecruiter24h(svc, 'ag-1', { application_id: 'app-1' });

    expect(createNotificationForAgency).toHaveBeenCalledOnce();
  });

  it('No-op wenn Bewerbung nicht gefunden', async () => {
    const { svc } = makeSvc({
      applications: { data: null, error: null },
    });

    const { createNotification, createNotificationForAgency } = await import('@/lib/notifications/create');

    await processSlaRecruiter24h(svc, 'ag-1', { application_id: 'missing' });

    expect(createNotification).not.toHaveBeenCalled();
    expect(createNotificationForAgency).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processSlaRecruiter48h
// ---------------------------------------------------------------------------

describe('processSlaRecruiter48h', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendet Eskalations-Notification an agency_owner bei 48h ohne Reaktion', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('applications', {
      data: { id: 'app-2', stage_id: 'stage-q', candidate_id: 'cand-1', updated_at: '2026-09-18T10:00:00Z' },
      error: null,
    });
    enqueue('pipeline_stages', { data: { stage_type: 'qualified' }, error: null });
    enqueue('conversations', { data: { id: 'conv-1' }, error: null });
    enqueue('messages', { data: null, count: 0, error: null });
    enqueue('candidates', { data: { name: 'Bernd Schmidt' }, error: null });
    enqueue('users', { data: { id: 'owner-1' }, error: null });

    const { createNotification } = await import('@/lib/notifications/create');

    await processSlaRecruiter48h(svc, 'ag-1', { application_id: 'app-2' });

    expect(createNotification).toHaveBeenCalledOnce();
    const callArgs = (createNotification as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.type).toBe('sla_breach');
    expect(callArgs.title).toContain('48h');
    expect(callArgs.user_id).toBe('owner-1');
  });

  it('No-op wenn Stage nicht mehr qualified', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('applications', {
      data: { id: 'app-2', stage_id: 'stage-i', candidate_id: 'cand-1', updated_at: '2026-09-18T10:00:00Z' },
      error: null,
    });
    enqueue('pipeline_stages', { data: { stage_type: 'interview' }, error: null });

    const { createNotification } = await import('@/lib/notifications/create');

    await processSlaRecruiter48h(svc, 'ag-1', { application_id: 'app-2' });

    expect(createNotification).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processDocumentsRequest
// ---------------------------------------------------------------------------

describe('processDocumentsRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendet Template wenn noch in Stufe und kein Dokument vorhanden', async () => {
    const { svc, enqueue } = makeSvc();

    // applications (gleiche Stage)
    enqueue('applications', {
      data: { id: 'app-3', stage_id: 'stage-doc', candidate_id: 'cand-1' },
      error: null,
    });
    // documents count → 0
    enqueue('documents', { data: null, count: 0, error: null });
    // conversations
    enqueue('conversations', {
      data: { id: 'conv-1', wa_account_id: 'wa-1' },
      error: null,
    });
    // candidates
    enqueue('candidates', {
      data: { name: 'Lena Wagner', phone_e164: '+49111222333' },
      error: null,
    });
    // whatsapp_templates
    enqueue('whatsapp_templates', {
      data: { id: 'tmpl-1', name: 'documents_request' },
      error: null,
    });
    // pipeline_stages (Stage-Name)
    enqueue('pipeline_stages', {
      data: { name: 'Unterlagenprüfung' },
      error: null,
    });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processDocumentsRequest(svc, 'ag-1', { application_id: 'app-3', stage_id: 'stage-doc' });

    expect(sendWhatsAppMessage).toHaveBeenCalledOnce();
    const callArgs = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.payload.template.name).toBe('documents_request');
  });

  it('No-op wenn Dokument bereits vorhanden', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('applications', {
      data: { id: 'app-3', stage_id: 'stage-doc', candidate_id: 'cand-1' },
      error: null,
    });
    // documents count → 1
    enqueue('documents', { data: null, count: 1, error: null });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processDocumentsRequest(svc, 'ag-1', { application_id: 'app-3', stage_id: 'stage-doc' });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('No-op wenn Bewerbung in anderer Stage (Stage geändert)', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('applications', {
      data: { id: 'app-3', stage_id: 'stage-other', candidate_id: 'cand-1' },
      error: null,
    });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processDocumentsRequest(svc, 'ag-1', { application_id: 'app-3', stage_id: 'stage-doc' });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('No-op wenn kein Template vorhanden', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('applications', {
      data: { id: 'app-3', stage_id: 'stage-doc', candidate_id: 'cand-1' },
      error: null,
    });
    enqueue('documents', { data: null, count: 0, error: null });
    enqueue('conversations', { data: { id: 'conv-1', wa_account_id: 'wa-1' }, error: null });
    enqueue('candidates', { data: { name: 'Lena Wagner', phone_e164: '+49111222333' }, error: null });
    // kein Template
    enqueue('whatsapp_templates', { data: null, error: null });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processDocumentsRequest(svc, 'ag-1', { application_id: 'app-3', stage_id: 'stage-doc' });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});
