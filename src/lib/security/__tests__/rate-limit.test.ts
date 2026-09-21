import { describe, it, expect, vi, beforeEach } from 'vitest';
import { checkRateLimit } from '../rate-limit';

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

function createMockClient() {
  // Track upsert and update calls for assertions
  const calls = {
    upserts: [] as Record<string, unknown>[],
    updates: [] as Record<string, unknown>[],
  };

  // Canned response for the select().eq().maybeSingle() chain
  let selectResponse: { data: unknown; error: unknown } = { data: null, error: null };

  function buildChain(table: string): Record<string, unknown> {
    const chain: Record<string, unknown> = {};

    chain.select = vi.fn().mockReturnValue(chain);
    chain.eq = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue(selectResponse);

    chain.upsert = vi.fn().mockImplementation((data: Record<string, unknown>) => {
      if (table === 'rate_limit_counters') calls.upserts.push(data);
      return Promise.resolve({ data: null, error: null });
    });

    chain.update = vi.fn().mockImplementation((data: Record<string, unknown>) => {
      if (table === 'rate_limit_counters') calls.updates.push(data);
      return chain; // allow .eq() chaining after update
    });

    return chain;
  }

  const client = {
    from: vi.fn().mockImplementation((table: string) => buildChain(table)),
    _calls: calls,
    _setSelectResponse(resp: { data: unknown; error: unknown }) {
      selectResponse = resp;
    },
    _reset() {
      calls.upserts = [];
      calls.updates = [];
      selectResponse = { data: null, error: null };
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkRateLimit', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
  });

  // 1. Kein bestehender Zaehler → upsert mit count 1, Rueckgabe true
  it('kein bestehender Zaehler: upsert count=1, gibt true zurueck', async () => {
    client._setSelectResponse({ data: null, error: null });

    const result = await checkRateLimit(client as never, 'apply:1.2.3.4', 20, 600);

    expect(result).toBe(true);
    expect(client._calls.upserts).toHaveLength(1);
    expect(client._calls.upserts[0]).toMatchObject({ key: 'apply:1.2.3.4', count: 1 });
    expect(client._calls.updates).toHaveLength(0);
  });

  // 2. Zaehler im Fenster unter Limit → update count+1, Rueckgabe true
  it('Zaehler im Fenster unter Limit: update count+1, gibt true zurueck', async () => {
    const windowStart = new Date(Date.now() - 60_000).toISOString(); // 1 Minute ago, within 600s
    client._setSelectResponse({ data: { window_start: windowStart, count: 5 }, error: null });

    const result = await checkRateLimit(client as never, 'apply:1.2.3.4', 20, 600);

    expect(result).toBe(true);
    expect(client._calls.updates).toHaveLength(1);
    expect(client._calls.updates[0]).toMatchObject({ count: 6 });
    expect(client._calls.upserts).toHaveLength(0);
  });

  // 3. Zaehler im Fenster auf Limit → Rueckgabe false, kein update
  it('Zaehler im Fenster auf Limit: gibt false zurueck, kein update', async () => {
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    client._setSelectResponse({ data: { window_start: windowStart, count: 20 }, error: null });

    const result = await checkRateLimit(client as never, 'apply:1.2.3.4', 20, 600);

    expect(result).toBe(false);
    expect(client._calls.updates).toHaveLength(0);
    expect(client._calls.upserts).toHaveLength(0);
  });

  // 4. Zaehler mit abgelaufenem window_start → Reset (upsert count=1, neues window_start), true
  it('abgelaufenes Fenster: upsert mit count=1 (Reset), gibt true zurueck', async () => {
    const windowStart = new Date(Date.now() - 700_000).toISOString(); // 700s ago, expired at 600s
    client._setSelectResponse({ data: { window_start: windowStart, count: 19 }, error: null });

    const result = await checkRateLimit(client as never, 'apply:1.2.3.4', 20, 600);

    expect(result).toBe(true);
    expect(client._calls.upserts).toHaveLength(1);
    expect(client._calls.upserts[0]).toMatchObject({ key: 'apply:1.2.3.4', count: 1 });
    expect(client._calls.updates).toHaveLength(0);
  });

  // 5. DB-Fehler beim select → fail-open: Rueckgabe true
  it('DB-Fehler beim select: fail-open, gibt true zurueck', async () => {
    client._setSelectResponse({ data: null, error: { message: 'connection error' } });

    const result = await checkRateLimit(client as never, 'apply:1.2.3.4', 20, 600);

    expect(result).toBe(true);
    // Kein upsert/update bei Fehler
    expect(client._calls.upserts).toHaveLength(0);
    expect(client._calls.updates).toHaveLength(0);
  });

  // Bonus: count genau limit-1 → erlaubt (Grenzfall)
  it('count = limit-1: gibt true zurueck und inkrementiert', async () => {
    const windowStart = new Date(Date.now() - 60_000).toISOString();
    client._setSelectResponse({ data: { window_start: windowStart, count: 19 }, error: null });

    const result = await checkRateLimit(client as never, 'apply:1.2.3.4', 20, 600);

    expect(result).toBe(true);
    expect(client._calls.updates).toHaveLength(1);
    expect(client._calls.updates[0]).toMatchObject({ count: 20 });
  });
});
