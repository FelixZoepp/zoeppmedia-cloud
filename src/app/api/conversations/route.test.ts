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

// --- Helpers ---
function makeRequest(params: Record<string, string> = {}): NextRequest {
  const url = new URL('http://localhost/api/conversations');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return new NextRequest(url.toString());
}

/**
 * Builds a minimal chainable Supabase query builder that resolves with the
 * provided result when awaited. All filter/sort methods return `this`.
 */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'is', 'gt', 'lt', 'or', 'order', 'limit']) {
    chain[m] = self;
  }
  // Make the chain itself thenable so `await query` works
  chain['then'] = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

function makeSvcMock(tableMap: Record<string, ReturnType<typeof makeChain>>) {
  return {
    from: (table: string) => tableMap[table] ?? makeChain({ data: null, error: null }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

// --- Tests ---
describe('GET /api/conversations', () => {
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

    const res = await GET(makeRequest());

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Nicht autorisiert');
  });

  // --- 403 per R7 (no empty array) ---
  it('returns 403 with Keine Agentur when getEffectiveAgencyId returns null (R7)', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);

    const res = await GET(makeRequest());

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Agentur');
  });

  // --- Happy path: all filter ---
  it('returns conversation list for valid agency (all filter)', async () => {
    const conversations = [
      {
        id: 'conv-1',
        state: 'human_active',
        unread_count: 2,
        last_message_at: new Date().toISOString(),
        candidate: { id: 'cand-1', name: 'Max Mustermann', phone_e164: '+491761234567', email: null },
        application: [],
      },
    ];

    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({ conversations: makeChain({ data: conversations, error: null }) })
    );

    const res = await GET(makeRequest({ filter: 'all' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
    expect(json).toHaveLength(1);
    expect(json[0].id).toBe('conv-1');
  });

  // --- Happy path: mine filter ---
  it('returns 200 for mine filter', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({ conversations: makeChain({ data: [], error: null }) })
    );

    const res = await GET(makeRequest({ filter: 'mine' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
  });

  // --- Happy path: search param ---
  it('returns 200 with search param', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({ conversations: makeChain({ data: [], error: null }) })
    );

    const res = await GET(makeRequest({ filter: 'all', search: 'Max' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json)).toBe(true);
  });

  // --- DB error ---
  it('returns 500 when Supabase returns an error', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({ conversations: makeChain({ data: null, error: { message: 'DB-Fehler' } }) })
    );

    const res = await GET(makeRequest());

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('DB-Fehler');
  });
});
