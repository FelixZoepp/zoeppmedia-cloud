import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
  getEffectiveAgencyId: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { GET } from './route';

// --- Constants ---
const AGENCY_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID   = '00000000-0000-4000-8000-000000000002';
const CONV_ID   = '00000000-0000-4000-8000-000000000003';

// --- Helpers ---
function makeRequest(convId: string = CONV_ID): NextRequest {
  return new NextRequest(`http://localhost/api/conversations/${convId}/messages`);
}

function makeParams(convId: string = CONV_ID) {
  return { params: Promise.resolve({ id: convId }) };
}

/**
 * Builds a minimal chainable Supabase query builder. All filter/sort methods
 * return `this`. The chain is thenable so `await query` resolves with `result`.
 */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'is', 'gt', 'lt', 'or', 'in', 'order', 'limit', 'update', 'single']) {
    chain[m] = self;
  }
  chain['then'] = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

/**
 * Builds a service mock where different `from(table)` calls can return
 * different chains. Useful for routes that query multiple tables.
 */
function makeSvcMock(calls: Array<ReturnType<typeof makeChain>>) {
  let callIndex = 0;
  return {
    from: (_table: string) => calls[callIndex++] ?? makeChain({ data: null, error: null }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

// --- Tests ---
describe('GET /api/conversations/[id]/messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
  });

  // --- 401 ---
  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Nicht autorisiert');
  });

  // --- 403 ---
  it('returns 403 when getEffectiveAgencyId returns null', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Agentur');
  });

  // --- 404: conversation not in agency ---
  it('returns 404 when conversation does not belong to agency', async () => {
    // First from('conversations').select(...).eq(...).eq(...).single() → null
    const convChain = makeChain({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue(makeSvcMock([convChain]));

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Nicht gefunden');
  });

  // --- Happy path: returns messages and resets unread_count ---
  it('returns messages and calls unread-reset UPDATE with id and agency_id', async () => {
    const messages = [
      {
        id: 'msg-1',
        direction: 'in',
        sender_type: 'candidate',
        body: 'Hallo',
        status: 'delivered',
        created_at: new Date().toISOString(),
      },
    ];

    // Track calls to verify .eq() chaining on the UPDATE
    const updateEqCalls: Array<[string, string]> = [];

    // Chain for conversations lookup (.single() returns conv)
    const convChain = makeChain({ data: { id: CONV_ID }, error: null });

    // Chain for messages SELECT
    const messagesChain = makeChain({ data: messages, error: null });

    // Chain for the UPDATE + two .eq() calls — we spy on eq to capture args
    const updateChain = makeChain({ data: null, error: null });
    const origEq = updateChain['eq'] as (...args: unknown[]) => unknown;
    updateChain['eq'] = (col: string, val: string) => {
      updateEqCalls.push([col, val]);
      return origEq(col, val);
    };

    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock([convChain, messagesChain, updateChain])
    );

    const res = await GET(makeRequest(), makeParams());

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe('msg-1');

    // Verify the UPDATE was scoped with BOTH id and agency_id (R2 tenant scoping)
    expect(updateEqCalls.some(([col, val]) => col === 'id' && val === CONV_ID)).toBe(true);
    expect(updateEqCalls.some(([col, val]) => col === 'agency_id' && val === AGENCY_ID)).toBe(true);
  });
});
