import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/notifications/create', () => ({
  createNotificationForInternals: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn().mockResolvedValue({ messageId: 'wamid.1', messageRowId: 'row-1' }),
}));
vi.mock('@/lib/whatsapp/window', () => ({
  isStopMessage: vi.fn((t?: string) => (t ?? '').trim().toLowerCase() === 'stop'),
}));
vi.mock('../replies', () => ({
  handleSalesReply: vi.fn().mockResolvedValue(null),
  todayBerlin: vi.fn(() => '2026-10-02'),
}));
vi.mock('../followup', () => ({
  pauseFollowupsOnReply: vi.fn().mockResolvedValue(false),
}));
vi.mock('../close-log', () => ({
  enqueueSalesCloseLog: vi.fn().mockResolvedValue(undefined),
}));

import { handleSalesBooking, handleSalesCancellation, SALES_AGENCY_ID } from '../calendly-chain';
import { processSalesInbound, inboundText } from '../inbound';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { handleSalesReply } from '../replies';

type Call = { table: string; method: string; args: unknown[] };

/** Supabase-Mock, der alle Aufrufe protokolliert. responses[table] = Ergebnis für maybeSingle/single. */
function makeSvc(responses: Record<string, unknown> = {}) {
  const calls: Call[] = [];
  const svc = {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      const record = (method: string) =>
        vi.fn((...args: unknown[]) => {
          calls.push({ table, method, args });
          return chain;
        });
      for (const m of ['select', 'eq', 'is', 'order', 'limit', 'update', 'like', 'upsert']) chain[m] = record(m);
      chain.insert = vi.fn((...args: unknown[]) => {
        calls.push({ table, method: 'insert', args });
        const res = { data: responses[`${table}.insert`] ?? null, error: null };
        return Object.assign(Promise.resolve(res), {
          select: () => ({ single: () => Promise.resolve({ data: responses[`${table}.insert`] ?? { id: 'new-id' }, error: null }) }),
        });
      });
      chain.maybeSingle = vi.fn().mockResolvedValue({ data: responses[table] ?? null, error: null });
      chain.single = vi.fn().mockResolvedValue({ data: responses[`${table}.single`] ?? responses[table] ?? null, error: null });
      chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return chain;
    }),
  };
  return { svc: svc as never, calls };
}

const booking = {
  chain: 'setting' as const,
  calendlyEventId: 'evt-1',
  eventTypeName: 'Analysegespräch mit Zoepp Media',
  eventName: 'Analysegespräch mit Zoepp Media',
  startTime: '2026-10-05T16:00:00Z',
  endTime: '2026-10-05T16:15:00Z',
  location: '+49 177 1908503',
  inviteeName: 'Riccardo Marini',
  inviteeEmail: 'r@example.com',
  phone: '+49 177 1908503',
};

describe('handleSalesBooking', () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.unstubAllEnvs());

  it('legt Prospect an, speichert die Buchung VOR den Jobs und plant 5 Jobs', async () => {
    vi.stubEnv('SALES_REMINDERS_ENABLED', 'true');
    const { svc, calls } = makeSvc({ pipeline_stages: { id: 'stage-1' }, 'candidates.insert': { id: 'prospect-1' } });

    const result = await handleSalesBooking(svc, booking, new Date('2026-10-02T10:00:00Z'));

    expect(result).toEqual({ prospectId: 'prospect-1', jobsScheduled: true });
    const eventUpsert = calls.findIndex((c) => c.table === 'calendly_events' && c.method === 'upsert');
    const firstJob = calls.findIndex((c) => c.table === 'scheduled_jobs' && c.method === 'insert');
    expect(eventUpsert).toBeGreaterThan(-1);
    expect(firstJob).toBeGreaterThan(eventUpsert);

    const row = calls[eventUpsert].args[0] as Record<string, unknown>;
    expect(row).toMatchObject({ agency_id: SALES_AGENCY_ID, candidate_id: 'prospect-1', invitee_phone: '+491771908503' });

    const convUpsert = calls.find((c) => c.table === 'conversations' && c.method === 'upsert');
    expect(convUpsert?.args[0]).toMatchObject({ agency_id: SALES_AGENCY_ID, candidate_id: 'prospect-1', state: 'human_active' });
    expect(calls.indexOf(convUpsert!)).toBeLessThan(firstJob);

    const jobTypes = calls.filter((c) => c.table === 'scheduled_jobs').map((c) => (c.args[0] as { type: string }).type);
    expect(jobTypes).toEqual([
      'sales.booking', 'sales.confirmation', 'sales.reminder', 'sales.unconfirmed_check', 'sales.noshow_check',
    ]);
    const unconfirmed = calls.find((c) => c.table === 'scheduled_jobs' && (c.args[0] as { type: string }).type === 'sales.unconfirmed_check');
    expect((unconfirmed?.args[0] as { run_at: string }).run_at).toBe('2026-10-05T14:00:00.000Z'); // 2h vorher
  });

  it('ohne Nummer: Buchung speichern, Team benachrichtigen, keine Jobs', async () => {
    vi.stubEnv('SALES_REMINDERS_ENABLED', 'true');
    const { svc, calls } = makeSvc();

    const result = await handleSalesBooking(svc, { ...booking, phone: null, location: 'https://zoom.us/j/1' });

    expect(result).toEqual({ prospectId: null, jobsScheduled: false });
    expect(calls.some((c) => c.table === 'calendly_events' && c.method === 'upsert')).toBe(true);
    expect(calls.some((c) => c.table === 'scheduled_jobs')).toBe(false);
    expect(createNotificationForInternals).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Sales: Buchung ohne Handynummer: Riccardo Marini' }),
    );
  });

  it('SALES_REMINDERS_ENABLED aus: Buchung speichern, aber keine Jobs', async () => {
    const { svc, calls } = makeSvc({ candidates: { id: 'prospect-1' } });
    const result = await handleSalesBooking(svc, booking);
    expect(result).toEqual({ prospectId: 'prospect-1', jobsScheduled: false });
    expect(calls.some((c) => c.table === 'scheduled_jobs')).toBe(false);
  });

  it('fasst nie Recruiting-Tabellen an (applications, appointments)', async () => {
    vi.stubEnv('SALES_REMINDERS_ENABLED', 'true');
    const { svc, calls } = makeSvc({ candidates: { id: 'prospect-1' } });
    await handleSalesBooking(svc, booking);
    expect(calls.some((c) => ['applications', 'appointments', 'bot_configs'].includes(c.table))).toBe(false);
  });
});

describe('handleSalesCancellation', () => {
  it('setzt die Buchung auf cancelled und cancelt offene Sales-Jobs', async () => {
    const { svc, calls } = makeSvc();
    await handleSalesCancellation(svc, 'evt-1');
    expect(calls).toContainEqual({ table: 'calendly_events', method: 'update', args: [{ status: 'cancelled' }] });
    expect(calls).toContainEqual({ table: 'scheduled_jobs', method: 'like', args: ['dedupe_key', 'sales.%:evt-1'] });
  });
});

describe('inboundText', () => {
  it('liest Text, Quick-Reply-Buttons und interaktive Antworten', () => {
    expect(inboundText({ id: '1', from: '49', type: 'text', text: { body: 'Hallo' } })).toBe('Hallo');
    expect(inboundText({ id: '1', from: '49', type: 'button', button: { text: 'Ja, ich bin dabei' } })).toBe('Ja, ich bin dabei');
    expect(
      inboundText({ id: '1', from: '49', type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'x', title: 'Ruf mich heute an' } } }),
    ).toBe('Ruf mich heute an');
    expect(inboundText({ id: '1', from: '49', type: 'audio', audio: { id: 'a' } })).toBe('[Sprachnachricht]');
  });
});

describe('processSalesInbound', () => {
  beforeEach(() => vi.clearAllMocks());

  const payload = {
    type: 'whatsapp.inbound' as const,
    phone_number_id: 'pn-sales',
    message: { id: 'wamid.in1', from: '4915202159031', type: 'button', button: { text: 'Ja, ich bin dabei' } },
    contacts: [{ profile: { name: 'Felix' }, wa_id: '4915202159031' }],
  };

  it('speichert die Button-Antwort, ruft die Sales-Auswertung und benachrichtigt das Team', async () => {
    const { svc, calls } = makeSvc({
      whatsapp_accounts: { id: 'wa-sales', agency_id: SALES_AGENCY_ID },
      candidates: { id: 'prospect-1', name: 'Felix Testkunde' },
      'conversations.single': { id: 'conv-1' },
    });

    await processSalesInbound(svc, payload);

    const msgInsert = calls.find((c) => c.table === 'messages' && c.method === 'insert');
    expect(msgInsert?.args[0]).toMatchObject({ body: 'Ja, ich bin dabei', direction: 'in', conversation_id: 'conv-1' });
    expect(handleSalesReply).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ candidateId: 'prospect-1', candidatePhone: '+4915202159031', text: 'Ja, ich bin dabei' }),
    );
    expect(createNotificationForInternals).toHaveBeenCalledOnce();
    // Kein Recruiting: keine Bot-Jobs, keine Bewerbungen
    expect(calls.some((c) => c.table === 'applications')).toBe(false);
    expect(calls.some((c) => c.table === 'scheduled_jobs')).toBe(false);
  });

  it('unbekannte Nummer: nur Benachrichtigung, nichts speichern', async () => {
    const { svc, calls } = makeSvc({ whatsapp_accounts: { id: 'wa-sales', agency_id: SALES_AGENCY_ID } });
    await processSalesInbound(svc, payload);
    expect(calls.some((c) => c.table === 'messages')).toBe(false);
    expect(createNotificationForInternals).toHaveBeenCalledOnce();
  });

  it('STOP: Opt-out setzen, keine Sales-Auswertung', async () => {
    const { svc, calls } = makeSvc({
      whatsapp_accounts: { id: 'wa-sales', agency_id: SALES_AGENCY_ID },
      candidates: { id: 'prospect-1', name: 'Felix Testkunde' },
      'conversations.single': { id: 'conv-1' },
    });
    await processSalesInbound(svc, { ...payload, message: { id: 'w2', from: '4915202159031', type: 'text', text: { body: 'STOP' } } });
    expect(calls).toContainEqual({ table: 'candidates', method: 'update', args: [{ whatsapp_opt_in: false }] });
    expect(handleSalesReply).not.toHaveBeenCalled();
  });
});
