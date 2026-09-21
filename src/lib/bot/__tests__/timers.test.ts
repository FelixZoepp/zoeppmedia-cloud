/**
 * Tests für timers.ts: armBotTimers + cancelBotTimers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { armBotTimers, armBotTimersV2, cancelBotTimers } from '../timers';
import type { SupabaseClient } from '@supabase/supabase-js';

function makeSvc(upsertResult = { data: null, error: null }, updateResult = { data: null, error: null }) {
  const upsertFn = vi.fn().mockResolvedValue(upsertResult);
  const updateChain: Record<string, unknown> = {};
  const updateMethods = ['eq', 'in', 'filter', 'not'];
  for (const m of updateMethods) {
    updateChain[m] = vi.fn(() => updateChain);
  }
  (updateChain as Record<string, unknown>).__resolves = updateResult;
  // Make the chain thenable for await
  updateChain.then = vi.fn((resolve: (v: unknown) => void) => Promise.resolve(updateResult).then(resolve));

  const fromMock = vi.fn().mockReturnValue({
    upsert: upsertFn,
    update: vi.fn().mockReturnValue(updateChain),
  });

  return {
    svc: { from: fromMock } as unknown as SupabaseClient,
    fromMock,
    upsertFn,
    updateChain,
  };
}

describe('armBotTimers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('legt genau 2 scheduled_jobs an (bot.nudge + bot.timeout)', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimers(svc, { agencyId: 'agency-1', conversationId: 'conv-1', botStep: 0 });

    expect(upsertFn).toHaveBeenCalledTimes(1);
    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(2);
  });

  it('dedupe-Key für bot.nudge ist "bot.nudge:{conversationId}:{botStep}"', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimers(svc, { agencyId: 'agency-1', conversationId: 'conv-42', botStep: 3 });

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    const nudgeRow = rows.find((r) => r.type === 'bot.nudge');
    expect(nudgeRow?.dedupe_key).toBe('bot.nudge:conv-42:3');
  });

  it('dedupe-Key für bot.timeout ist "bot.timeout:{conversationId}:{botStep}"', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimers(svc, { agencyId: 'agency-1', conversationId: 'conv-42', botStep: 3 });

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    const timeoutRow = rows.find((r) => r.type === 'bot.timeout');
    expect(timeoutRow?.dedupe_key).toBe('bot.timeout:conv-42:3');
  });

  it('bot.nudge run_at ist ca. +4h (±30s Toleranz)', async () => {
    const before = Date.now();
    const { svc, upsertFn } = makeSvc();
    await armBotTimers(svc, { agencyId: 'agency-1', conversationId: 'conv-1', botStep: 0 });
    const after = Date.now();

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    const nudgeRow = rows.find((r) => r.type === 'bot.nudge');
    const runAt = new Date(nudgeRow?.run_at as string).getTime();
    const fourHours = 4 * 60 * 60 * 1000;
    expect(runAt).toBeGreaterThanOrEqual(before + fourHours - 30_000);
    expect(runAt).toBeLessThanOrEqual(after + fourHours + 30_000);
  });

  it('bot.timeout run_at ist ca. +48h (±30s Toleranz)', async () => {
    const before = Date.now();
    const { svc, upsertFn } = makeSvc();
    await armBotTimers(svc, { agencyId: 'agency-1', conversationId: 'conv-1', botStep: 0 });
    const after = Date.now();

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    const timeoutRow = rows.find((r) => r.type === 'bot.timeout');
    const runAt = new Date(timeoutRow?.run_at as string).getTime();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    expect(runAt).toBeGreaterThanOrEqual(before + fortyEightHours - 30_000);
    expect(runAt).toBeLessThanOrEqual(after + fortyEightHours + 30_000);
  });

  it('payload enthält conversation_id und bot_step', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimers(svc, { agencyId: 'agency-1', conversationId: 'conv-7', botStep: 2 });

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    for (const row of rows) {
      expect((row.payload as Record<string, unknown>).conversation_id).toBe('conv-7');
      expect((row.payload as Record<string, unknown>).bot_step).toBe(2);
    }
  });

  it('upsert nutzt onConflict=dedupe_key und ignoreDuplicates=true', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimers(svc, { agencyId: 'agency-1', conversationId: 'conv-1', botStep: 0 });

    const opts = upsertFn.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.onConflict).toBe('dedupe_key');
    expect(opts.ignoreDuplicates).toBe(true);
  });

  it('setzt agency_id auf jeder Row', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimers(svc, { agencyId: 'agency-99', conversationId: 'conv-1', botStep: 0 });

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    for (const row of rows) {
      expect(row.agency_id).toBe('agency-99');
    }
  });

  it('setzt status=pending auf jeder Row', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimers(svc, { agencyId: 'agency-1', conversationId: 'conv-1', botStep: 0 });

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    for (const row of rows) {
      expect(row.status).toBe('pending');
    }
  });
});

describe('armBotTimersV2', () => {
  beforeEach(() => vi.clearAllMocks());

  it('legt genau 3 scheduled_jobs an (bot.nudge + bot.nudge2 + bot.close — KEIN bot.timeout)', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimersV2(svc, { agencyId: 'agency-1', conversationId: 'conv-1', botStep: 0 });

    expect(upsertFn).toHaveBeenCalledTimes(1);
    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(3);
  });

  it('enthält bot.nudge, bot.nudge2, bot.close — kein bot.timeout', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimersV2(svc, { agencyId: 'agency-1', conversationId: 'conv-42', botStep: 2 });

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    const types = rows.map((r) => r.type);
    expect(types).toContain('bot.nudge');
    expect(types).toContain('bot.nudge2');
    expect(types).toContain('bot.close');
    expect(types).not.toContain('bot.timeout');
  });

  it('dedupe-Keys korrekt für alle 3 Jobs', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimersV2(svc, { agencyId: 'agency-1', conversationId: 'conv-X', botStep: 1 });

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    const nudge = rows.find((r) => r.type === 'bot.nudge');
    const nudge2 = rows.find((r) => r.type === 'bot.nudge2');
    const close = rows.find((r) => r.type === 'bot.close');
    expect(nudge?.dedupe_key).toBe('bot.nudge:conv-X:1');
    expect(nudge2?.dedupe_key).toBe('bot.nudge2:conv-X:1');
    expect(close?.dedupe_key).toBe('bot.close:conv-X:1');
  });

  it('bot.nudge2 run_at ist ca. +24h (±30s Toleranz)', async () => {
    const before = Date.now();
    const { svc, upsertFn } = makeSvc();
    await armBotTimersV2(svc, { agencyId: 'agency-1', conversationId: 'conv-1', botStep: 0 });
    const after = Date.now();

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    const nudge2Row = rows.find((r) => r.type === 'bot.nudge2');
    const runAt = new Date(nudge2Row?.run_at as string).getTime();
    const twentyFourHours = 24 * 60 * 60 * 1000;
    expect(runAt).toBeGreaterThanOrEqual(before + twentyFourHours - 30_000);
    expect(runAt).toBeLessThanOrEqual(after + twentyFourHours + 30_000);
  });

  it('bot.close run_at ist ca. +48h (±30s Toleranz)', async () => {
    const before = Date.now();
    const { svc, upsertFn } = makeSvc();
    await armBotTimersV2(svc, { agencyId: 'agency-1', conversationId: 'conv-1', botStep: 0 });
    const after = Date.now();

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    const closeRow = rows.find((r) => r.type === 'bot.close');
    const runAt = new Date(closeRow?.run_at as string).getTime();
    const fortyEightHours = 48 * 60 * 60 * 1000;
    expect(runAt).toBeGreaterThanOrEqual(before + fortyEightHours - 30_000);
    expect(runAt).toBeLessThanOrEqual(after + fortyEightHours + 30_000);
  });

  it('upsert nutzt onConflict=dedupe_key und ignoreDuplicates=true', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimersV2(svc, { agencyId: 'agency-1', conversationId: 'conv-1', botStep: 0 });

    const opts = upsertFn.mock.calls[0][1] as Record<string, unknown>;
    expect(opts.onConflict).toBe('dedupe_key');
    expect(opts.ignoreDuplicates).toBe(true);
  });

  it('setzt agency_id und status=pending auf jeder Row', async () => {
    const { svc, upsertFn } = makeSvc();
    await armBotTimersV2(svc, { agencyId: 'agency-99', conversationId: 'conv-1', botStep: 0 });

    const rows = upsertFn.mock.calls[0][0] as Array<Record<string, unknown>>;
    for (const row of rows) {
      expect(row.agency_id).toBe('agency-99');
      expect(row.status).toBe('pending');
    }
  });
});

describe('cancelBotTimers', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ruft UPDATE auf scheduled_jobs auf', async () => {
    const fromMock = vi.fn();
    const updateChain: Record<string, ReturnType<typeof vi.fn>> = {};
    for (const m of ['eq', 'in', 'filter']) {
      updateChain[m] = vi.fn(() => updateChain);
    }
    // Make awaitable by adding a .then
    (updateChain as unknown as Record<string, unknown>).then = vi.fn(
      (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve)
    );
    const updateFn = vi.fn().mockReturnValue(updateChain);

    fromMock.mockReturnValue({ update: updateFn });

    const svc = { from: fromMock } as unknown as SupabaseClient;
    await cancelBotTimers(svc, { agencyId: 'agency-1', conversationId: 'conv-1' });

    expect(fromMock).toHaveBeenCalledWith('scheduled_jobs');
    expect(updateFn).toHaveBeenCalledWith({ status: 'cancelled' });
  });

  it('filtert auf agency_id', async () => {
    const fromMock = vi.fn();
    const eqCalls: Array<[string, string]> = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['eq', 'in', 'filter']) {
      chain[m] = vi.fn((...args: unknown[]) => {
        if (m === 'eq') eqCalls.push(args as [string, string]);
        return chain;
      });
    }
    (chain as Record<string, unknown>).then = vi.fn(
      (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve)
    );
    fromMock.mockReturnValue({ update: vi.fn().mockReturnValue(chain) });

    const svc = { from: fromMock } as unknown as SupabaseClient;
    await cancelBotTimers(svc, { agencyId: 'agency-42', conversationId: 'conv-1' });

    const agencyEq = eqCalls.find((c) => c[0] === 'agency_id');
    expect(agencyEq?.[1]).toBe('agency-42');
  });

  it('filtert auf status=pending', async () => {
    const fromMock = vi.fn();
    const eqCalls: Array<[string, string]> = [];
    const chain: Record<string, unknown> = {};
    for (const m of ['eq', 'in', 'filter']) {
      chain[m] = vi.fn((...args: unknown[]) => {
        if (m === 'eq') eqCalls.push(args as [string, string]);
        return chain;
      });
    }
    (chain as Record<string, unknown>).then = vi.fn(
      (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve)
    );
    fromMock.mockReturnValue({ update: vi.fn().mockReturnValue(chain) });

    const svc = { from: fromMock } as unknown as SupabaseClient;
    await cancelBotTimers(svc, { agencyId: 'agency-1', conversationId: 'conv-1' });

    const statusEq = eqCalls.find((c) => c[0] === 'status');
    expect(statusEq?.[1]).toBe('pending');
  });
});
