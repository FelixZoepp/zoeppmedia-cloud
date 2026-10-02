import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../notify', () => ({ notifySales: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../close', () => ({
  addCloseNoteByEmail: vi.fn().mockResolvedValue(true),
  addCloseTask: vi.fn().mockResolvedValue('lead_1'),
}));

import {
  buildClickToken,
  parseClickToken,
  isPreviewBot,
  calendlyUrlWithPrefill,
  recordClick,
  processSalesClickCheck,
  BOOKING_URLS,
} from '../tracking';
import { addCloseNoteByEmail, addCloseTask } from '../close';
import { notifySales } from '../notify';

const PID = '04d38f12-0cb9-4ce2-8314-525d6dfa2b97';

type Op = { table: string; op: string; args: unknown[] };
function makeSvc(data: Record<string, unknown>) {
  const ops: Op[] = [];
  return {
    ops,
    svc: {
      from: vi.fn((table: string) => {
        const chain: Record<string, unknown> = {};
        for (const m of ['select', 'eq', 'gte', 'limit']) chain[m] = vi.fn(() => chain);
        chain.insert = vi.fn((...args: unknown[]) => {
          ops.push({ table, op: 'insert', args });
          return Promise.resolve({ data: null, error: null });
        });
        chain.maybeSingle = vi.fn().mockResolvedValue({ data: data[table] ?? null, error: null });
        return chain;
      }),
    } as never,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'test-secret');
});
afterEach(() => vi.unstubAllEnvs());

describe('Tracking-Token', () => {
  it('Hin und zurück', () => {
    const token = buildClickToken(PID, 'beratung', 'fu_2');
    expect(parseClickToken(token)).toEqual({ prospectId: PID, target: 'beratung', source: 'fu_2' });
  });

  it('manipulierte Token werden abgelehnt', () => {
    const token = buildClickToken(PID, 'setting', 'fu_1');
    expect(parseClickToken(token.replace('.s.', '.b.'))).toBeNull();
    expect(parseClickToken(token.slice(0, -1) + 'x')).toBeNull();
    expect(parseClickToken('quatsch')).toBeNull();
  });

  it('erkennt Link-Vorschau-Bots', () => {
    expect(isPreviewBot('WhatsApp/2.23.20.0 A')).toBe(true);
    expect(isPreviewBot('facebookexternalhit/1.1')).toBe(true);
    expect(isPreviewBot('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/604.1')).toBe(false);
  });

  it('Calendly mit Name und E-Mail vorausgefüllt', () => {
    expect(calendlyUrlWithPrefill('setting', { name: 'Riccardo Marini', email: 'r@example.com' })).toBe(
      `${BOOKING_URLS.setting}?name=Riccardo+Marini&email=r%40example.com`,
    );
  });
});

describe('recordClick', () => {
  const prospect = { id: PID, name: 'Riccardo Marini', email: 'r@example.com', phone_e164: '+491771908503' };

  it('erster Klick → Notiz in Close, Check in 30 Min., Weiterleitung zu Calendly', async () => {
    const { svc, ops } = makeSvc({ candidates: prospect });
    const now = new Date('2026-10-16T08:05:00Z');

    const url = await recordClick(svc, { prospectId: PID, target: 'setting', source: 'fu_1' }, now);

    expect(url).toContain(BOOKING_URLS.setting);
    const job = ops.find((o) => o.table === 'scheduled_jobs')!.args[0] as Record<string, unknown>;
    expect(job).toMatchObject({ type: 'sales.click_check', run_at: '2026-10-16T08:35:00.000Z' });
    expect(addCloseNoteByEmail).toHaveBeenCalledWith('r@example.com', expect.stringContaining('Termin buchen'), '+491771908503');
    expect(notifySales).not.toHaveBeenCalled(); // Klick allein meldet nichts in Slack
  });

  it('weiterer Klick, solange der Check offen ist → nichts doppelt', async () => {
    const { svc, ops } = makeSvc({ candidates: prospect, scheduled_jobs: { id: 'job-1' } });
    await recordClick(svc, { prospectId: PID, target: 'setting', source: 'fu_1' });
    expect(ops).toHaveLength(0);
    expect(addCloseNoteByEmail).not.toHaveBeenCalled();
  });
});

describe('processSalesClickCheck', () => {
  const payload = { prospect_id: PID, clicked_at: '2026-10-16T08:05:00Z', source: 'fu_1' };

  it('gebucht → nichts tun', async () => {
    const { svc } = makeSvc({ calendly_events: { id: 'evt' } });
    expect(await processSalesClickCheck(svc, payload, '2026-10-16')).toBe('booked');
    expect(notifySales).not.toHaveBeenCalled();
  });

  it('nicht gebucht → Slack "jetzt anrufen" + Aufgabe "Heute anrufen" in Close', async () => {
    const { svc } = makeSvc({
      candidates: { id: PID, name: 'Riccardo Marini', email: null, phone_e164: '+491771908503' },
      conversations: { id: 'conv-1' },
    });
    expect(await processSalesClickCheck(svc, payload, '2026-10-16')).toBe('call');
    expect(addCloseTask).toHaveBeenCalledWith(
      { email: null, phone: '+491771908503' }, expect.stringContaining('Heute anrufen'), '2026-10-16',
    );
    expect(notifySales).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ title: 'Riccardo Marini hat geklickt, aber nicht gebucht — jetzt anrufen!', conversationId: 'conv-1' }),
    );
  });
});
