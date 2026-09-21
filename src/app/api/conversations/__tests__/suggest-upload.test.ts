import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks (hoisted before imports) ---

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

vi.mock('@/lib/ai/llm-client', () => ({
  llmTextCall: vi.fn(),
  DIALOG_MODEL: 'claude-haiku-4-5',
}));

vi.mock('@/lib/whatsapp/send', () => ({
  sendWhatsAppMessage: vi.fn(),
}));

vi.mock('@/lib/whatsapp/provider', () => ({
  getProvider: vi.fn(),
}));

vi.mock('@/lib/crypto', () => ({
  decryptSecret: vi.fn(),
}));

// --- Imports after mocks ---
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { llmTextCall } from '@/lib/ai/llm-client';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { getProvider } from '@/lib/whatsapp/provider';
import { decryptSecret } from '@/lib/crypto';

import { POST as suggestPOST } from '../[id]/suggest/route';
import { POST as uploadPOST } from '../[id]/upload/route';

// --- Constants ---
const AGENCY_ID  = '00000000-0000-4000-8000-000000000001';
const CONV_ID    = '00000000-0000-4000-8000-000000000002';
const USER_ID    = '00000000-0000-4000-8000-000000000003';
const OTHER_AGENCY = '00000000-0000-4000-8000-000000000099';

// --- Helper: minimal chainable Supabase mock ---
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of [
    'select', 'eq', 'neq', 'update', 'insert', 'delete', 'order',
    'upsert', 'filter', 'in', 'limit', 'upload',
  ]) {
    chain[m] = self;
  }
  chain['single'] = () => Promise.resolve(result);
  chain['maybeSingle'] = () => Promise.resolve(result);
  // Make chain also thenable for queries without .single()
  chain['then'] = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}

function makeSvcMock(tableMap: Record<string, ReturnType<typeof makeChain>>) {
  return {
    from: (table: string) => tableMap[table] ?? makeChain({ data: null, error: null }),
    storage: {
      from: (_bucket: string) => ({
        upload: vi.fn().mockResolvedValue({ data: { path: 'some/path' }, error: null }),
      }),
    },
  } as unknown as ReturnType<typeof createAdminClient>;
}

// --- Auth setup helper ---
function setupAuth() {
  vi.mocked(canWriteRole).mockReturnValue(true);
  vi.mocked(getCurrentUser).mockResolvedValue({
    id: USER_ID, email: 'r@test.de', name: 'Recruiter', role: 'agency_member', agency_id: AGENCY_ID,
  });
  vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
}

// =====================================================================
// SUGGEST TESTS
// =====================================================================

describe('POST /api/conversations/[id]/suggest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
  });

  function makeParams(id = CONV_ID): Promise<{ id: string }> {
    return Promise.resolve({ id });
  }

  function makeReq(id = CONV_ID): NextRequest {
    return new NextRequest(`http://localhost/api/conversations/${id}/suggest`, {
      method: 'POST',
    });
  }

  // --- Auth chain ---

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await suggestPOST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Nicht autorisiert');
  });

  it('returns 403 when canWriteRole is false', async () => {
    vi.mocked(canWriteRole).mockReturnValue(false);
    const res = await suggestPOST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Schreibrechte');
  });

  it('returns 403 when getEffectiveAgencyId returns null', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);
    const res = await suggestPOST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Agentur');
  });

  // --- Conversation not found / wrong agency ---

  it('returns 404 when conversation belongs to a different agency', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        conversations: makeChain({ data: null, error: null }),
      })
    );

    const res = await suggestPOST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('Konversation nicht gefunden');
  });

  // --- Happy path ---

  it('returns LLM text as suggestion on success', async () => {
    const messages = [
      { direction: 'in', sender_type: 'candidate', body: 'Hallo, ich interessiere mich.', created_at: new Date().toISOString() },
      { direction: 'out', sender_type: 'bot', body: 'Schön, erzähl mir mehr!', created_at: new Date().toISOString() },
    ];

    const conv = {
      id: CONV_ID,
      candidate: { name: 'Max Mustermann' },
      application: [{ job: { title: 'Verkäufer (m/w/d)' } }],
    };

    const messagesChain = makeChain({ data: messages, error: null });
    const convChain = makeChain({ data: conv, error: null });

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'conversations') return convChain;
        if (table === 'messages') return messagesChain;
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    vi.mocked(llmTextCall).mockResolvedValue('Super Vorschlag für Antwort!');

    const res = await suggestPOST(makeReq(), { params: makeParams() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suggestion).toBe('Super Vorschlag für Antwort!');
    expect(llmTextCall).toHaveBeenCalledOnce();
  });
});

// =====================================================================
// UPLOAD TESTS
// =====================================================================

describe('POST /api/conversations/[id]/upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupAuth();
    vi.mocked(decryptSecret).mockReturnValue('fake-token');
    vi.mocked(sendWhatsAppMessage).mockResolvedValue({ messageId: 'wamid.abc123', messageRowId: 'row-1' });
    vi.mocked(getProvider).mockReturnValue({
      uploadMedia: vi.fn().mockResolvedValue({ mediaId: 'media-123' }),
      sendMessage: vi.fn(),
      getMediaUrl: vi.fn(),
      createTemplate: vi.fn(),
      listTemplates: vi.fn(),
      registerPhone: vi.fn(),
      subscribeWebhook: vi.fn(),
      exchangeCode: vi.fn(),
    });
  });

  function makeParams(id = CONV_ID): Promise<{ id: string }> {
    return Promise.resolve({ id });
  }

  function makeFormDataRequest(file: File, id = CONV_ID): NextRequest {
    const formData = new FormData();
    formData.append('file', file);
    return new NextRequest(`http://localhost/api/conversations/${id}/upload`, {
      method: 'POST',
      body: formData,
    });
  }

  function makeJpegFile(sizeBytes = 1024): File {
    const buf = new Uint8Array(sizeBytes);
    return new File([buf], 'test.jpg', { type: 'image/jpeg' });
  }

  function makePdfFile(sizeBytes = 1024): File {
    const buf = new Uint8Array(sizeBytes);
    return new File([buf], 'test.pdf', { type: 'application/pdf' });
  }

  function makeLargeJpegFile(): File {
    // 10 MB + 1 byte = over limit
    const sizeBytes = 10 * 1024 * 1024 + 1;
    const buf = new Uint8Array(sizeBytes);
    return new File([buf], 'big.jpg', { type: 'image/jpeg' });
  }

  function makeInvalidMimeFile(): File {
    const buf = new Uint8Array(512);
    return new File([buf], 'virus.exe', { type: 'application/octet-stream' });
  }

  function setupConvSvc(overrideConv?: unknown) {
    const conv = overrideConv ?? {
      id: CONV_ID,
      wa_account_id: 'wa-acct-1',
      candidate_id: 'cand-1',
    };
    const waAccount = {
      id: 'wa-acct-1',
      phone_number_id: 'phone-num-1',
      access_token_enc: 'enc:tag:cipher',
    };
    const candidate = {
      id: 'cand-1',
      phone_e164: '+491234567890',
    };

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'conversations') return makeChain({ data: conv, error: null });
        if (table === 'whatsapp_accounts') return makeChain({ data: waAccount, error: null });
        if (table === 'candidates') return makeChain({ data: candidate, error: null });
        return makeChain({ data: null, error: null });
      },
      storage: {
        from: (_bucket: string) => ({
          upload: vi.fn().mockResolvedValue({ data: { path: 'some/path' }, error: null }),
        }),
      },
    } as unknown as ReturnType<typeof createAdminClient>);
  }

  // --- Auth chain ---

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const req = makeFormDataRequest(makeJpegFile());
    const res = await uploadPOST(req, { params: makeParams() });
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Nicht autorisiert');
  });

  it('returns 403 when canWriteRole is false', async () => {
    vi.mocked(canWriteRole).mockReturnValue(false);
    const req = makeFormDataRequest(makeJpegFile());
    const res = await uploadPOST(req, { params: makeParams() });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Schreibrechte');
  });

  it('returns 403 when getEffectiveAgencyId returns null', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);
    const req = makeFormDataRequest(makeJpegFile());
    const res = await uploadPOST(req, { params: makeParams() });
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Agentur');
  });

  // --- MIME validation ---

  it('returns 400 for disallowed MIME type', async () => {
    const req = makeFormDataRequest(makeInvalidMimeFile());
    const res = await uploadPOST(req, { params: makeParams() });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Dateityp nicht erlaubt');
  });

  // --- Size validation ---

  it('returns 400 when file exceeds 10 MB', async () => {
    const req = makeFormDataRequest(makeLargeJpegFile());
    const res = await uploadPOST(req, { params: makeParams() });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Datei zu groß (max. 10 MB)');
  });

  // --- Happy path: calls uploadMedia + sendWhatsAppMessage ---

  it('calls uploadMedia and sendWhatsAppMessage on success', async () => {
    setupConvSvc();
    const req = makeFormDataRequest(makeJpegFile());
    const res = await uploadPOST(req, { params: makeParams() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.messageId).toBe('wamid.abc123');

    expect(getProvider).toHaveBeenCalledOnce();
    const providerMock = vi.mocked(getProvider).mock.results[0].value;
    expect(providerMock.uploadMedia).toHaveBeenCalledOnce();
    expect(sendWhatsAppMessage).toHaveBeenCalledOnce();
  });

  // --- PDF happy path ---

  it('sends document payload for PDF files', async () => {
    setupConvSvc();
    const req = makeFormDataRequest(makePdfFile());
    const res = await uploadPOST(req, { params: makeParams() });
    expect(res.status).toBe(200);

    const sendCall = vi.mocked(sendWhatsAppMessage).mock.calls[0][1];
    expect(sendCall.payload.type).toBe('document');
  });

  // --- image payload type ---

  it('sends image payload for JPEG files', async () => {
    setupConvSvc();
    const req = makeFormDataRequest(makeJpegFile());
    const res = await uploadPOST(req, { params: makeParams() });
    expect(res.status).toBe(200);

    const sendCall = vi.mocked(sendWhatsAppMessage).mock.calls[0][1];
    expect(sendCall.payload.type).toBe('image');
  });

  // --- Send-Fehler → 400 (R4-Muster) ---

  it('returns 400 with error message when sendWhatsAppMessage throws', async () => {
    setupConvSvc();
    vi.mocked(sendWhatsAppMessage).mockRejectedValue(new Error('Fenster abgelaufen'));

    const req = makeFormDataRequest(makeJpegFile());
    const res = await uploadPOST(req, { params: makeParams() });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Fenster abgelaufen');
  });
});
