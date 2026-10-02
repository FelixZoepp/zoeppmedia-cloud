/**
 * Tests für den /api/cron/tick Tick-Cron.
 * I3: getRetryDelay und isDeadLetter werden direkt aus route.ts importiert.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getRetryDelay, isDeadLetter } from '@/app/api/cron/tick/route';

// next/server muss gemockt werden damit der route-Import nicht fehlschlägt
vi.mock('next/server', () => ({
  NextRequest: class {},
  NextResponse: {
    json: vi.fn((body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })),
  },
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock('@/lib/workers/whatsapp-inbound', () => ({
  processInbound: vi.fn(),
}));

vi.mock('@/lib/workers/whatsapp-status', () => ({
  processStatus: vi.fn(),
}));

vi.mock('@/lib/workers/whatsapp-send', () => ({
  processSend: vi.fn(),
}));

vi.mock('@/lib/workers/media-download', () => ({
  processMediaDownload: vi.fn(),
}));

vi.mock('@/lib/workers/bot-open', () => ({
  processBotOpen: vi.fn(),
}));

vi.mock('@/lib/workers/bot-nudge', () => ({
  processBotNudge: vi.fn(),
}));

vi.mock('@/lib/workers/bot-timeout', () => ({
  processBotTimeout: vi.fn(),
}));

vi.mock('@/lib/notifications/create', () => ({
  createNotificationForAgency: vi.fn(),
}));

describe('getRetryDelay', () => {
  it('erster Versuch → 1 Minute', () => {
    expect(getRetryDelay(1)).toBe(60_000);
  });

  it('zweiter Versuch → 5 Minuten', () => {
    expect(getRetryDelay(2)).toBe(5 * 60_000);
  });

  it('dritter Versuch → 15 Minuten', () => {
    expect(getRetryDelay(3)).toBe(15 * 60_000);
  });

  it('vierter Versuch → 60 Minuten', () => {
    expect(getRetryDelay(4)).toBe(60 * 60_000);
  });

  it('Versuch über Maximum → clamped auf 60 Minuten', () => {
    expect(getRetryDelay(10)).toBe(60 * 60_000);
    expect(getRetryDelay(99)).toBe(60 * 60_000);
  });
});

describe('isDeadLetter', () => {
  it('weniger als 5 Versuche → kein Dead Letter', () => {
    expect(isDeadLetter(0)).toBe(false);
    expect(isDeadLetter(1)).toBe(false);
    expect(isDeadLetter(4)).toBe(false);
  });

  it('genau 5 Versuche → Dead Letter', () => {
    expect(isDeadLetter(5)).toBe(true);
  });

  it('mehr als 5 Versuche → Dead Letter', () => {
    expect(isDeadLetter(6)).toBe(true);
    expect(isDeadLetter(99)).toBe(true);
  });
});

describe('GET Handler — Auth-Guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'test-secret-123');
  });

  it('lehnt Request ohne Authorization-Header ab (401)', async () => {
    const { GET } = await import('@/app/api/cron/tick/route');
    const { NextResponse } = await import('next/server');

    const req = {
      headers: { get: vi.fn().mockReturnValue(null) },
    } as unknown as import('next/server').NextRequest;

    await GET(req);

    expect(NextResponse.json).toHaveBeenCalledWith(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  });

  it('lehnt Request mit falschem Token ab (401)', async () => {
    const { GET } = await import('@/app/api/cron/tick/route');
    const { NextResponse } = await import('next/server');

    const req = {
      headers: { get: vi.fn().mockReturnValue('Bearer falsches-token') },
    } as unknown as import('next/server').NextRequest;

    await GET(req);

    expect(NextResponse.json).toHaveBeenCalledWith(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  });

  it('verarbeitet Request mit korrektem Token (200 ok)', async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ data: [] }),
      from: vi.fn(),
    });

    const { GET } = await import('@/app/api/cron/tick/route');
    const { NextResponse } = await import('next/server');

    const req = {
      headers: { get: vi.fn().mockReturnValue('Bearer test-secret-123') },
    } as unknown as import('next/server').NextRequest;

    await GET(req);

    expect(NextResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true })
    );
  });
});

vi.mock('@/lib/sales/inbound', () => ({
  processSalesInbound: vi.fn(),
}));

describe('GET Handler — Weiche Sales-Bot / Recruiting', () => {
  const SALES_AGENCY = '2e4140ec-efc5-46db-9746-0ce3c32dc558';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CRON_SECRET', 'test-secret-123');
  });

  async function runTickWith(event: { id: string; agency_id: string; attempts: number; payload: Record<string, unknown> }) {
    const chain: Record<string, unknown> = {};
    for (const m of ['update', 'eq', 'in', 'select', 'insert', 'lt']) chain[m] = vi.fn(() => chain);
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
    const { createAdminClient } = await import('@/lib/supabase/admin');
    (createAdminClient as ReturnType<typeof vi.fn>).mockReturnValue({
      rpc: vi.fn((fn: string) => Promise.resolve({ data: fn === 'claim_inbox_events' ? [event] : [] })),
      from: vi.fn(() => chain),
    });
    const { GET } = await import('@/app/api/cron/tick/route');
    await GET({ headers: { get: vi.fn().mockReturnValue('Bearer test-secret-123') } } as unknown as import('next/server').NextRequest);
  }

  it('Nachricht auf der Sales-Nummer geht nur an den Sales-Bot', async () => {
    const { processSalesInbound } = await import('@/lib/sales/inbound');
    const { processInbound } = await import('@/lib/workers/whatsapp-inbound');
    await runTickWith({ id: 'ev-1', agency_id: SALES_AGENCY, attempts: 1, payload: { type: 'whatsapp.inbound', phone_number_id: 'pn' } });
    expect(processSalesInbound).toHaveBeenCalledOnce();
    expect(processInbound).not.toHaveBeenCalled();
  });

  it('Nachricht einer Kunden-Agentur geht nur an den Recruiting-Worker', async () => {
    const { processSalesInbound } = await import('@/lib/sales/inbound');
    const { processInbound } = await import('@/lib/workers/whatsapp-inbound');
    await runTickWith({ id: 'ev-2', agency_id: 'kunde-1', attempts: 1, payload: { type: 'whatsapp.inbound', phone_number_id: 'pn' } });
    expect(processInbound).toHaveBeenCalledOnce();
    expect(processSalesInbound).not.toHaveBeenCalled();
  });
});
