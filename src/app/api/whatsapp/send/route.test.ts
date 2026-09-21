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

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn(),
}));

import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { POST } from './route';

// --- Constants (valid RFC 4122 v4 UUIDs for Zod .uuid() validation) ---
const AGENCY_ID = '00000000-0000-4000-8000-000000000001';
const CONV_ID   = '00000000-0000-4000-8000-000000000002';

// --- Helpers ---
function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Builds a minimal chainable Supabase query builder that resolves .single()
 * with the provided result. All filter methods (.select, .eq, .update, .insert,
 * .delete, .order) return `this` so they can be freely chained.
 */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'update', 'insert', 'delete', 'order', 'upsert']) {
    chain[m] = self;
  }
  chain['single'] = () => Promise.resolve(result);
  chain['maybeSingle'] = () => Promise.resolve(result);
  return chain;
}

/** Builds a client that routes table names to pre-configured chains. */
function makeSvcMock(tableMap: Record<string, ReturnType<typeof makeChain>>) {
  return {
    from: (table: string) => tableMap[table] ?? makeChain({ data: null, error: null }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

// --- Tests ---
describe('POST /api/whatsapp/send', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canWriteRole).mockReturnValue(true);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Nicht autorisiert');
  });

  it('returns 400 on Zod validation error (missing conversationId)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);

    // conversationId is missing — Zod will reject
    const res = await POST(makeRequest({ type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validierungsfehler');
  });

  it('returns 404 when conversation not found for agency', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);

    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        conversations: makeChain({ data: null, error: null }),
      })
    );

    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Konversation nicht gefunden');
  });

  it('returns 400 with German error message when sendWhatsAppMessage throws', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);

    // Conversation exists with state 'open' so state-update path is triggered too
    const convData = { id: CONV_ID, candidate_id: 'cand-1', wa_account_id: 'wa-1', state: 'open' };
    const candidateData = { phone_e164: '+491761234567' };

    // The route calls .from('conversations') twice: once for lookup, once for state update.
    // We use a call counter via a factory to hand out different chains.
    let convCallCount = 0;
    const convChainLookup = makeChain({ data: convData, error: null });
    const convChainUpdate = {
      ...makeChain({ data: null, error: null }),
      // update().eq().eq() just needs to resolve — makeChain already returns self on .update
    };

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'conversations') {
          convCallCount++;
          return convCallCount === 1 ? convChainLookup : convChainUpdate;
        }
        if (table === 'candidates') {
          return makeChain({ data: candidateData, error: null });
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    vi.mocked(sendWhatsAppMessage).mockRejectedValue(new Error('24h-Fenster abgelaufen'));

    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('24h-Fenster abgelaufen');
  });

  it('returns { ok: true, messageId } on success', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: 'u1', email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);

    // state is already 'human_active' → no state update, only two from() calls
    const convData = { id: CONV_ID, candidate_id: 'cand-1', wa_account_id: 'wa-1', state: 'human_active' };
    const candidateData = { phone_e164: '+491761234567' };

    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        conversations: makeChain({ data: convData, error: null }),
        candidates: makeChain({ data: candidateData, error: null }),
      })
    );

    vi.mocked(sendWhatsAppMessage).mockResolvedValue({ messageId: 'wamid.abc123', messageRowId: 'row-uuid-1' });

    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, messageId: 'wamid.abc123' });
  });
});
