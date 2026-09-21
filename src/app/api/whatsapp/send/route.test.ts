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
const AGENCY_ID   = '00000000-0000-4000-8000-000000000001';
const CONV_ID     = '00000000-0000-4000-8000-000000000002';
const TEMPLATE_ID = '00000000-0000-4000-8000-000000000003';

// --- Helpers ---
function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/whatsapp/send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Makes a NextRequest with a deliberately malformed (non-JSON) body. */
function makeMalformedRequest(): NextRequest {
  return new NextRequest('http://localhost/api/whatsapp/send', {
    method: 'POST',
    body: 'this is { not json at all',
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
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: 'u1', email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
  });

  // --- Auth / role guards ---

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Nicht autorisiert');
  });

  it('returns 403 when canWriteRole is false (I4)', async () => {
    vi.mocked(canWriteRole).mockReturnValue(false);

    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Schreibrechte');
  });

  it('returns 403 when getEffectiveAgencyId returns null (I4)', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);

    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Agentur');
  });

  // --- Input validation ---

  it('returns 400 on Zod validation error (missing conversationId)', async () => {
    // conversationId is missing — Zod will reject
    const res = await POST(makeRequest({ type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validierungsfehler');
  });

  it('returns 400 on malformed JSON body (I4/I1)', async () => {
    const res = await POST(makeMalformedRequest());

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Ungültiger Request-Body');
  });

  it('returns 400 when type=text and body is empty string (M2)', async () => {
    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: '   ' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validierungsfehler');
  });

  it('returns 400 when type=text and body is missing (M2)', async () => {
    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Validierungsfehler');
  });

  // --- Conversation / candidate lookup ---

  it('returns 404 when conversation not found for agency', async () => {
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

  it('returns 400 when candidate has no phone_e164 (I4)', async () => {
    const convData = { id: CONV_ID, candidate_id: 'cand-1', wa_account_id: 'wa-1', state: 'open' };

    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        conversations: makeChain({ data: convData, error: null }),
        candidates: makeChain({ data: { phone_e164: null }, error: null }),
      })
    );

    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Telefonnummer nicht vorhanden');
  });

  // --- Template branch ---

  it('succeeds for template type and asserts sendWhatsAppMessage called with template payload (I4)', async () => {
    const convData = { id: CONV_ID, candidate_id: 'cand-1', wa_account_id: 'wa-1', state: 'open' };
    const candidateData = { phone_e164: '+491761234567' };
    const templateData = { name: 'bewerbung_einladung', language: 'de' };

    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        conversations: makeChain({ data: convData, error: null }),
        candidates: makeChain({ data: candidateData, error: null }),
        whatsapp_templates: makeChain({ data: templateData, error: null }),
      })
    );

    vi.mocked(sendWhatsAppMessage).mockResolvedValue({ messageId: 'wamid.tmpl1', messageRowId: 'row-tmpl-1' });

    const res = await POST(makeRequest({
      conversationId: CONV_ID,
      type: 'template',
      templateId: TEMPLATE_ID,
      templateVariables: { '1': 'Max Mustermann' },
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, messageId: 'wamid.tmpl1' });

    // Assert sendWhatsAppMessage was called with template payload including name/language/components
    expect(sendWhatsAppMessage).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(sendWhatsAppMessage).mock.calls[0][1];
    expect(callArgs.payload.type).toBe('template');
    expect(callArgs.payload.template?.name).toBe('bewerbung_einladung');
    expect(callArgs.payload.template?.language).toEqual({ code: 'de' });
    expect(callArgs.payload.template?.components).toEqual([{
      type: 'body',
      parameters: [{ type: 'text', text: 'Max Mustermann' }],
    }]);
    expect(callArgs.templateId).toBe(TEMPLATE_ID);
  });

  // --- Send failure / state update (C3 regression) ---

  it('returns 400 with German error message when sendWhatsAppMessage throws', async () => {
    const convData = { id: CONV_ID, candidate_id: 'cand-1', wa_account_id: 'wa-1', state: 'open' };
    const candidateData = { phone_e164: '+491761234567' };

    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        conversations: makeChain({ data: convData, error: null }),
        candidates: makeChain({ data: candidateData, error: null }),
      })
    );

    vi.mocked(sendWhatsAppMessage).mockRejectedValue(new Error('24h-Fenster abgelaufen'));

    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('24h-Fenster abgelaufen');
  });

  it('does NOT call conversations state-update when sendWhatsAppMessage throws (C3 regression, I4)', async () => {
    const convData = { id: CONV_ID, candidate_id: 'cand-1', wa_account_id: 'wa-1', state: 'open' };
    const candidateData = { phone_e164: '+491761234567' };

    // Track every .from() call so we can verify no second conversations call happens
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
    });

    // Build a svc mock where conversations chain exposes an update spy
    const convChain = makeChain({ data: convData, error: null });
    (convChain as Record<string, unknown>)['update'] = updateSpy;

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'conversations') return convChain;
        if (table === 'candidates') return makeChain({ data: candidateData, error: null });
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    vi.mocked(sendWhatsAppMessage).mockRejectedValue(new Error('24h-Fenster abgelaufen'));

    await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    // State update must NOT have been called because send threw
    expect(updateSpy).not.toHaveBeenCalled();
  });

  // --- Success ---

  it('returns { ok: true, messageId } on success', async () => {
    // state is already 'human_active' → no state update
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

  it('calls state-update with agency_id scope after successful send (C3+C4)', async () => {
    // state is 'open' so state-update SHOULD run after success
    const convData = { id: CONV_ID, candidate_id: 'cand-1', wa_account_id: 'wa-1', state: 'open' };
    const candidateData = { phone_e164: '+491761234567' };

    // Track the eq calls on the update chain to verify agency_id scoping
    const eqSpy = vi.fn().mockReturnThis();
    const updateChain = { update: vi.fn().mockReturnValue({ eq: eqSpy }) };

    let convCallCount = 0;
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'conversations') {
          convCallCount++;
          if (convCallCount === 1) return makeChain({ data: convData, error: null });
          return updateChain as unknown as ReturnType<typeof makeChain>;
        }
        if (table === 'candidates') return makeChain({ data: candidateData, error: null });
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    vi.mocked(sendWhatsAppMessage).mockResolvedValue({ messageId: 'wamid.xyz', messageRowId: 'row-2' });

    const res = await POST(makeRequest({ conversationId: CONV_ID, type: 'text', body: 'Hallo' }));

    expect(res.status).toBe(200);

    // update() was called once (after send succeeded)
    expect(updateChain.update).toHaveBeenCalledOnce();
    // eq should have been called with both id and agency_id
    expect(eqSpy).toHaveBeenCalledWith('id', CONV_ID);
    expect(eqSpy).toHaveBeenCalledWith('agency_id', AGENCY_ID);
  });
});
