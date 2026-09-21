/**
 * Tests für Reminder-Worker (Phase 4, Task 4).
 * TDD: Tests zuerst, dann Implementierung.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processReminder24h,
  processReminder2h,
  processFollowupCheck,
  processInviteFollowup,
  processNoShowFollowup,
} from '../appointment-reminders';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'r1' }),
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
  createNotificationForAgency: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn() }));

vi.mock('@/lib/whatsapp/window', () => ({
  isQuietHours: vi.fn().mockReturnValue(false),
  nextAllowedTime: vi.fn().mockReturnValue(new Date('2026-10-12T06:00:00Z')),
}));

// ---------------------------------------------------------------------------
// Chain-Mock helper
// ---------------------------------------------------------------------------

function makeSvc(tableResponses: Record<string, unknown> = {}) {
  const fromMock = vi.fn();
  const queues: Record<string, Array<{ data: unknown; error: unknown }>> = {};
  const updated: Record<string, unknown[]> = {};

  function enqueue(table: string, resp: { data: unknown; error: unknown }) {
    if (!queues[table]) queues[table] = [];
    queues[table].push(resp);
  }

  function dequeue(table: string): { data: unknown; error: unknown } {
    if (queues[table] && queues[table].length > 0) return queues[table].shift()!;
    if (table in tableResponses) return tableResponses[table] as { data: unknown; error: unknown };
    return { data: null, error: null };
  }

  fromMock.mockImplementation((table: string) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'eq', 'is', 'in', 'filter', 'not', 'maybeSingle', 'single',
                     'insert', 'update', 'upsert', 'delete', 'gte', 'lte', 'or', 'limit'];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }

    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(dequeue(table))
    );
    (chain.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
      Promise.resolve(dequeue(table))
    );
    (chain.update as ReturnType<typeof vi.fn>).mockImplementation((data: unknown) => {
      if (!updated[table]) updated[table] = [];
      updated[table].push(data);
      return chain;
    });

    return chain;
  });

  return {
    svc: { from: fromMock, rpc: vi.fn() } as unknown as import('@supabase/supabase-js').SupabaseClient,
    fromMock,
    updated,
    enqueue,
  };
}

// ---------------------------------------------------------------------------
// processReminder24h
// ---------------------------------------------------------------------------

describe('processReminder24h', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendet Template und loggt Activity bei aktivem Termin', async () => {
    const { svc, enqueue } = makeSvc();

    // appointments (agency_id-scoped, booked)
    enqueue('appointments', {
      data: {
        id: 'appt-1',
        status: 'booked',
        application_id: 'app-1',
        starts_at: '2026-10-11T10:00:00Z',
        location: 'Büro Berlin',
      },
      error: null,
    });
    // applications
    enqueue('applications', {
      data: { id: 'app-1', candidate_id: 'cand-1' },
      error: null,
    });
    // candidates
    enqueue('candidates', {
      data: { id: 'cand-1', name: 'Felix Müller', phone_e164: '+49123456789', whatsapp_opt_in: true },
      error: null,
    });
    // agencies
    enqueue('agencies', {
      data: { id: 'ag-1', timezone: 'Europe/Berlin' },
      error: null,
    });
    // conversations
    enqueue('conversations', {
      data: { id: 'conv-1', wa_account_id: 'wa-1' },
      error: null,
    });
    // whatsapp_templates
    enqueue('whatsapp_templates', {
      data: { id: 'tmpl-1', name: 'appointment_reminder_24h', body: 'Hallo {{1}}' },
      error: null,
    });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    const { logActivity } = await import('@/lib/activity/log');

    await processReminder24h(svc, 'ag-1', { appointment_id: 'appt-1' });

    expect(sendWhatsAppMessage).toHaveBeenCalledOnce();
    expect(logActivity).toHaveBeenCalled();
  });

  it('No-op bei abgesagtem Termin (Storno-Recheck P4-R7)', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('appointments', {
      data: { id: 'appt-2', status: 'cancelled', application_id: 'app-1', starts_at: '2026-10-11T10:00:00Z', location: null },
      error: null,
    });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processReminder24h(svc, 'ag-1', { appointment_id: 'appt-2' });

    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('verschiebt run_at bei Ruhezeit (P4-R6)', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    (isQuietHours as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { svc, enqueue, fromMock } = makeSvc();

    enqueue('appointments', {
      data: { id: 'appt-3', status: 'booked', application_id: 'app-1', starts_at: '2026-10-11T10:00:00Z', location: null },
      error: null,
    });
    // agencies (für nextAllowedTime)
    enqueue('agencies', {
      data: { id: 'ag-1', timezone: 'Europe/Berlin' },
      error: null,
    });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processReminder24h(svc, 'ag-1', { appointment_id: 'appt-3' });

    // Kein Send
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
    // scheduled_jobs update wurde aufgerufen
    expect(fromMock).toHaveBeenCalledWith('scheduled_jobs');
  });

  it('No-op wenn Termin nicht gefunden', async () => {
    const { svc } = makeSvc({
      appointments: { data: null, error: null },
    });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processReminder24h(svc, 'ag-1', { appointment_id: 'missing' });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processReminder2h
// ---------------------------------------------------------------------------

describe('processReminder2h', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Zurück auf false für andere Tests
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    vi.mocked(isQuietHours).mockReturnValue(false);
  });

  it('sendet IMMER, auch in Ruhezeit (bypassQuietHours P4-R6)', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    (isQuietHours as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const { svc, enqueue } = makeSvc();

    enqueue('appointments', {
      data: { id: 'appt-4', status: 'booked', application_id: 'app-1', starts_at: '2026-10-11T10:00:00Z', location: 'Remote' },
      error: null,
    });
    enqueue('applications', {
      data: { id: 'app-1', candidate_id: 'cand-1' },
      error: null,
    });
    enqueue('candidates', {
      data: { id: 'cand-1', name: 'Anna Schmidt', phone_e164: '+49987654321', whatsapp_opt_in: true },
      error: null,
    });
    enqueue('agencies', {
      data: { id: 'ag-1', timezone: 'Europe/Berlin' },
      error: null,
    });
    enqueue('conversations', {
      data: { id: 'conv-2', wa_account_id: 'wa-1' },
      error: null,
    });
    enqueue('whatsapp_templates', {
      data: { id: 'tmpl-2', name: 'appointment_reminder_2h', body: 'Hallo {{1}}' },
      error: null,
    });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');

    await processReminder2h(svc, 'ag-1', { appointment_id: 'appt-4' });

    expect(sendWhatsAppMessage).toHaveBeenCalledOnce();
    const callArgs = (sendWhatsAppMessage as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(callArgs.bypassQuietHours).toBe(true);
  });

  it('No-op bei status=cancelled (P4-R7)', async () => {
    const { svc, enqueue } = makeSvc();
    enqueue('appointments', {
      data: { id: 'appt-5', status: 'cancelled', application_id: 'app-1', starts_at: '2026-10-11T10:00:00Z', location: null },
      error: null,
    });

    const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
    await processReminder2h(svc, 'ag-1', { appointment_id: 'appt-5' });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processFollowupCheck
// ---------------------------------------------------------------------------

describe('processFollowupCheck', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendet Notification wenn Termin noch booked/confirmed ist (P4-R12)', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('appointments', {
      data: { id: 'appt-6', status: 'booked', application_id: 'app-1', starts_at: '2026-10-11T10:00:00Z', location: null },
      error: null,
    });
    enqueue('applications', {
      data: { id: 'app-1', candidate_id: 'cand-1' },
      error: null,
    });

    const { createNotificationForAgency } = await import('@/lib/notifications/create');

    await processFollowupCheck(svc, 'ag-1', { appointment_id: 'appt-6' });

    expect(createNotificationForAgency).toHaveBeenCalledOnce();
  });

  it('No-op wenn Termin bereits abgesagt', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('appointments', {
      data: { id: 'appt-7', status: 'cancelled', application_id: 'app-1', starts_at: '2026-10-11T10:00:00Z', location: null },
      error: null,
    });

    const { createNotificationForAgency } = await import('@/lib/notifications/create');

    await processFollowupCheck(svc, 'ag-1', { appointment_id: 'appt-7' });

    expect(createNotificationForAgency).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processInviteFollowup
// ---------------------------------------------------------------------------

describe('processInviteFollowup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendet Notification an Agentur wenn Einladung noch nicht gebucht', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('appointments', {
      data: { id: 'appt-8', status: 'proposed', application_id: 'app-1', starts_at: null, location: null },
      error: null,
    });

    const { createNotificationForAgency } = await import('@/lib/notifications/create');

    await processInviteFollowup(svc, 'ag-1', { appointment_id: 'appt-8' });

    expect(createNotificationForAgency).toHaveBeenCalledOnce();
  });

  it('No-op wenn Einladung bereits gebucht', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('appointments', {
      data: { id: 'appt-9', status: 'booked', application_id: 'app-1', starts_at: '2026-10-11T10:00:00Z', location: null },
      error: null,
    });

    const { createNotificationForAgency } = await import('@/lib/notifications/create');

    await processInviteFollowup(svc, 'ag-1', { appointment_id: 'appt-9' });

    expect(createNotificationForAgency).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// processNoShowFollowup
// ---------------------------------------------------------------------------

describe('processNoShowFollowup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendet Notification bei No-Show (Termin war booked, ist jetzt überfällig)', async () => {
    const { svc, enqueue } = makeSvc();

    enqueue('appointments', {
      data: { id: 'appt-10', status: 'booked', application_id: 'app-1', starts_at: '2026-10-10T10:00:00Z', location: null },
      error: null,
    });
    enqueue('applications', {
      data: { id: 'app-1', candidate_id: 'cand-1' },
      error: null,
    });

    const { createNotificationForAgency } = await import('@/lib/notifications/create');

    await processNoShowFollowup(svc, 'ag-1', { appointment_id: 'appt-10' });

    expect(createNotificationForAgency).toHaveBeenCalledOnce();
  });
});
