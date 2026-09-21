import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
  getEffectiveAgencyId: vi.fn(),
}));

vi.mock('@/lib/recruiting/scope', () => ({
  canWriteRole: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/bot/timers', () => ({
  cancelBotTimers: vi.fn(),
}));

import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { cancelBotTimers } from '@/lib/bot/timers';
import { PATCH } from '../[id]/route';

// --- Constants ---
const AGENCY_ID = '00000000-0000-4000-8000-000000000001';
const CONV_ID   = '00000000-0000-4000-8000-000000000002';
const USER_ID   = '00000000-0000-4000-8000-000000000003';
const USER_ID_2 = '00000000-0000-4000-8000-000000000004';

// --- Helpers ---
function makeRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/conversations/${CONV_ID}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeMalformedRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/conversations/${CONV_ID}`, {
    method: 'PATCH',
    body: 'this is { not json at all',
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeParams(id = CONV_ID): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

/**
 * Builds a minimal chainable Supabase query builder that resolves .single()
 * with the provided result. All filter/mutate methods return `this`.
 */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'update', 'insert', 'delete', 'order', 'upsert', 'filter', 'in']) {
    chain[m] = self;
  }
  chain['single'] = () => Promise.resolve(result);
  chain['maybeSingle'] = () => Promise.resolve(result);
  return chain;
}

function makeSvcMock(tableMap: Record<string, ReturnType<typeof makeChain>>) {
  return {
    from: (table: string) => tableMap[table] ?? makeChain({ data: null, error: null }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

// --- Tests ---
describe('PATCH /api/conversations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canWriteRole).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
    vi.mocked(cancelBotTimers).mockResolvedValue(undefined);
  });

  // --- Auth / role guards ---

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await PATCH(makeRequest({ state: 'human_active' }), { params: makeParams() });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Nicht autorisiert');
  });

  it('returns 403 when canWriteRole is false', async () => {
    vi.mocked(canWriteRole).mockReturnValue(false);

    const res = await PATCH(makeRequest({ state: 'human_active' }), { params: makeParams() });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Schreibrechte');
  });

  it('returns 403 when getEffectiveAgencyId returns null', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);

    const res = await PATCH(makeRequest({ state: 'human_active' }), { params: makeParams() });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Agentur');
  });

  // --- Input validation ---

  it('returns 400 on malformed JSON', async () => {
    const res = await PATCH(makeMalformedRequest(), { params: makeParams() });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Ungültiger Request-Body');
  });

  it('returns 400 when body contains neither assigned_to nor state', async () => {
    const res = await PATCH(makeRequest({}), { params: makeParams() });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Nichts zu ändern');
  });

  it('returns 400 when state is "closed" (only bot_active/human_active allowed)', async () => {
    const res = await PATCH(makeRequest({ state: 'closed' }), { params: makeParams() });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Ungültiger Status');
  });

  it('returns 400 when state is "waiting" (only bot_active/human_active allowed)', async () => {
    const res = await PATCH(makeRequest({ state: 'waiting' }), { params: makeParams() });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Ungültiger Status');
  });

  // --- Conversation not found / wrong agency ---

  it('returns 404 when conversation belongs to different agency', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        conversations: makeChain({ data: null, error: null }),
      })
    );

    const res = await PATCH(makeRequest({ state: 'human_active' }), { params: makeParams() });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Konversation nicht gefunden');
  });

  // --- assigned_to: user validation ---

  it('returns 400 when assigned_to points to a user not in agency', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'conversations') {
          return makeChain({ data: { id: CONV_ID, state: 'bot_active', agency_id: AGENCY_ID }, error: null });
        }
        if (table === 'users') {
          // User nicht gefunden (falsche Agentur)
          return makeChain({ data: null, error: null });
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makeRequest({ assigned_to: USER_ID_2 }), { params: makeParams() });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Nutzer nicht gefunden');
  });

  it('allows assigned_to: null (Zuweisung entfernen)', async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
    });

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'conversations') {
          const chain = makeChain({ data: { id: CONV_ID, state: 'human_active', agency_id: AGENCY_ID }, error: null });
          (chain as Record<string, unknown>)['update'] = updateSpy;
          return chain;
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makeRequest({ assigned_to: null }), { params: makeParams() });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    // update should have been called with assigned_to: null
    expect(updateSpy).toHaveBeenCalledOnce();
    const updateArg = updateSpy.mock.calls[0][0];
    expect(updateArg).toHaveProperty('assigned_to', null);
  });

  it('allows valid assigned_to user from same agency', async () => {
    let tableCallCount = 0;
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
    });

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        tableCallCount++;
        if (table === 'conversations') {
          const chain = makeChain({ data: { id: CONV_ID, state: 'human_active', agency_id: AGENCY_ID }, error: null });
          (chain as Record<string, unknown>)['update'] = updateSpy;
          return chain;
        }
        if (table === 'users') {
          return makeChain({ data: { id: USER_ID_2, agency_id: AGENCY_ID }, error: null });
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makeRequest({ assigned_to: USER_ID_2 }), { params: makeParams() });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const updateArg = updateSpy.mock.calls[0][0];
    expect(updateArg).toHaveProperty('assigned_to', USER_ID_2);
  });

  // --- state: human_active (Bot pausieren) ---

  it('state: human_active → updates conversation and calls cancelBotTimers', async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
    });

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'conversations') {
          const chain = makeChain({ data: { id: CONV_ID, state: 'bot_active', agency_id: AGENCY_ID }, error: null });
          (chain as Record<string, unknown>)['update'] = updateSpy;
          return chain;
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makeRequest({ state: 'human_active' }), { params: makeParams() });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Update mit state=human_active
    expect(updateSpy).toHaveBeenCalledOnce();
    const updateArg = updateSpy.mock.calls[0][0];
    expect(updateArg).toHaveProperty('state', 'human_active');

    // cancelBotTimers muss aufgerufen worden sein
    expect(cancelBotTimers).toHaveBeenCalledOnce();
    const timerArgs = vi.mocked(cancelBotTimers).mock.calls[0][1];
    expect(timerArgs.agencyId).toBe(AGENCY_ID);
    expect(timerArgs.conversationId).toBe(CONV_ID);
  });

  // --- state: bot_active (Bot fortsetzen) ---

  it('state: bot_active → updates conversation, does NOT call cancelBotTimers', async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
    });

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'conversations') {
          const chain = makeChain({ data: { id: CONV_ID, state: 'human_active', agency_id: AGENCY_ID }, error: null });
          (chain as Record<string, unknown>)['update'] = updateSpy;
          return chain;
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makeRequest({ state: 'bot_active' }), { params: makeParams() });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    // Update mit state=bot_active
    expect(updateSpy).toHaveBeenCalledOnce();
    const updateArg = updateSpy.mock.calls[0][0];
    expect(updateArg).toHaveProperty('state', 'bot_active');

    // cancelBotTimers darf NICHT aufgerufen werden bei bot_active
    expect(cancelBotTimers).not.toHaveBeenCalled();
  });

  // --- combined: assigned_to + state ---

  it('can update both assigned_to and state in a single PATCH', async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
    });

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'conversations') {
          const chain = makeChain({ data: { id: CONV_ID, state: 'bot_active', agency_id: AGENCY_ID }, error: null });
          (chain as Record<string, unknown>)['update'] = updateSpy;
          return chain;
        }
        if (table === 'users') {
          return makeChain({ data: { id: USER_ID_2, agency_id: AGENCY_ID }, error: null });
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(
      makeRequest({ state: 'human_active', assigned_to: USER_ID_2 }),
      { params: makeParams() }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);

    const updateArg = updateSpy.mock.calls[0][0];
    expect(updateArg).toHaveProperty('state', 'human_active');
    expect(updateArg).toHaveProperty('assigned_to', USER_ID_2);
    expect(cancelBotTimers).toHaveBeenCalledOnce();
  });
});
