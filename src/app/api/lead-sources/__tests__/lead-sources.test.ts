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

import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { GET, POST } from '../route';
import { PATCH } from '../[id]/route';

// --- Konstanten ---
const AGENCY_ID  = '00000000-0000-4000-8000-000000000001';
const OTHER_AGENCY_ID = '00000000-0000-4000-8000-000000000099';
const SOURCE_ID  = '00000000-0000-4000-8000-000000000002';
const USER_ID    = '00000000-0000-4000-8000-000000000005';
const SLUG       = 'test-agentur';
const FEED_KEY   = 'abc123feedkey';

// --- Hilfsfunktionen ---
function makeParams(id = SOURCE_ID): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/lead-sources', { method: 'GET' });
}

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/lead-sources', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makePatchRequest(id: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/lead-sources/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Erstellt einen chainbaren Supabase-Query-Mock. */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'update', 'insert', 'delete', 'order', 'upsert', 'filter', 'in']) {
    chain[m] = self;
  }
  chain['maybeSingle'] = () => Promise.resolve(result);
  chain['single']      = () => Promise.resolve(result);
  chain['then']        = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

const MOCK_SOURCE_GENERIC = {
  id: SOURCE_ID,
  agency_id: AGENCY_ID,
  kind: 'generic',
  name: 'Testquelle',
  config: { fields: { phone: 'phone' } },
  active: true,
  created_at: '2026-01-01T00:00:00Z',
};

const MOCK_AGENCY = {
  id: AGENCY_ID,
  slug: SLUG,
  indeed_feed_key: FEED_KEY,
};

// --- Tests ---

describe('GET /api/lead-sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'test@test.de', name: 'Test', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
    vi.mocked(canWriteRole).mockReturnValue(true);
  });

  it('401 ohne Auth', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/autorisiert/i);
  });

  it('403 ohne Agentur', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Agentur/i);
  });

  it('liefert nur Quellen der eigenen Agentur und feed.url', async () => {
    let queriedAgencyId: string | null = null;

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'lead_sources') {
          return {
            select: () => ({
              eq: (col: string, val: string) => {
                if (col === 'agency_id') queriedAgencyId = val;
                return {
                  order: () => Promise.resolve({ data: [MOCK_SOURCE_GENERIC], error: null }),
                };
              },
            }),
          };
        }
        if (table === 'agencies') {
          return {
            select: () => ({
              eq: () => ({
                single: () => Promise.resolve({ data: MOCK_AGENCY, error: null }),
              }),
            }),
          };
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(queriedAgencyId).toBe(AGENCY_ID);
    expect(json.sources).toHaveLength(1);
    expect(json.sources[0]).not.toHaveProperty('secret');
    expect(json.feed.url).toContain(`/api/feeds/indeed/${SLUG}.xml`);
    expect(json.feed.url).toContain(`key=${FEED_KEY}`);
  });
});

describe('POST /api/lead-sources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'test@test.de', name: 'Test', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
    vi.mocked(canWriteRole).mockReturnValue(true);
  });

  it('401 ohne Auth', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(makePostRequest({ kind: 'generic', name: 'Test' }));
    expect(res.status).toBe(401);
  });

  it('403 ohne Agentur', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);
    const res = await POST(makePostRequest({ kind: 'generic', name: 'Test' }));
    expect(res.status).toBe(403);
  });

  it('403 ohne Schreibrechte', async () => {
    vi.mocked(canWriteRole).mockReturnValue(false);
    const res = await POST(makePostRequest({ kind: 'generic', name: 'Test' }));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Schreibrechte/i);
  });

  it('400 bei ungültigem kind', async () => {
    const res = await POST(makePostRequest({ kind: 'indeed', name: 'Test' }));
    expect(res.status).toBe(400);
  });

  it('400 bei leerem name', async () => {
    const res = await POST(makePostRequest({ kind: 'generic', name: '' }));
    expect(res.status).toBe(400);
  });

  it('400 bei name über 120 Zeichen', async () => {
    const res = await POST(makePostRequest({ kind: 'generic', name: 'x'.repeat(121) }));
    expect(res.status).toBe(400);
  });

  it('legt generische Quelle mit Secret an und gibt webhook_url zurück', async () => {
    let insertedData: Record<string, unknown> | null = null;

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'lead_sources') {
          return {
            insert: (data: Record<string, unknown>) => {
              insertedData = data;
              return {
                select: () => ({
                  single: () => Promise.resolve({
                    data: { ...data, id: SOURCE_ID, created_at: '2026-01-01T00:00:00Z' },
                    error: null,
                  }),
                }),
              };
            },
          };
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await POST(makePostRequest({ kind: 'generic', name: 'Meine Quelle' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.source).toBeDefined();
    expect(json.source.secret).toBeUndefined(); // Secret nie im source-Objekt
    expect(json.secret).toBeTruthy();
    expect(typeof json.secret).toBe('string');
    expect(json.secret).toHaveLength(48); // 24 bytes hex = 48 chars
    expect(json.webhook_url).toContain(`/api/webhooks/generic/${SOURCE_ID}`);
    expect(insertedData).toMatchObject({ kind: 'generic', name: 'Meine Quelle', agency_id: AGENCY_ID });
    expect(insertedData!['secret']).toBeTruthy();
  });

  it('legt Meta-Quelle ohne Secret an', async () => {
    let insertedData: Record<string, unknown> | null = null;

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'lead_sources') {
          return {
            insert: (data: Record<string, unknown>) => {
              insertedData = data;
              return {
                select: () => ({
                  single: () => Promise.resolve({
                    data: { ...data, id: SOURCE_ID, created_at: '2026-01-01T00:00:00Z' },
                    error: null,
                  }),
                }),
              };
            },
          };
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await POST(makePostRequest({ kind: 'meta', name: 'Meta Quelle' }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(insertedData!['secret']).toBeNull();
    // Meta-Quelle hat keine webhook_url
    expect(json.webhook_url).toBeUndefined();
  });
});

describe('PATCH /api/lead-sources/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'test@test.de', name: 'Test', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
    vi.mocked(canWriteRole).mockReturnValue(true);
  });

  it('401 ohne Auth', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest(SOURCE_ID, { active: false }), { params: makeParams() });
    expect(res.status).toBe(401);
  });

  it('403 ohne Agentur', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest(SOURCE_ID, { active: false }), { params: makeParams() });
    expect(res.status).toBe(403);
  });

  it('403 ohne Schreibrechte', async () => {
    vi.mocked(canWriteRole).mockReturnValue(false);
    const res = await PATCH(makePatchRequest(SOURCE_ID, { active: false }), { params: makeParams() });
    expect(res.status).toBe(403);
  });

  it('404 bei fremder Agentur (kein Existenz-Leak)', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (_table: string) => makeChain({ data: null, error: null }),
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makePatchRequest(SOURCE_ID, { active: false }), { params: makeParams() });
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/nicht gefunden/i);
  });

  it('aktualisiert Quelle erfolgreich', async () => {
    let updatedWith: unknown = null;

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'lead_sources') {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  maybeSingle: () => Promise.resolve({ data: MOCK_SOURCE_GENERIC, error: null }),
                }),
              }),
            }),
            update: (data: unknown) => {
              updatedWith = data;
              return {
                eq: () => ({
                  eq: () => ({
                    select: () => ({
                      single: () => Promise.resolve({
                        data: { ...MOCK_SOURCE_GENERIC, active: false },
                        error: null,
                      }),
                    }),
                  }),
                }),
              };
            },
          };
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PATCH(makePatchRequest(SOURCE_ID, { active: false }), { params: makeParams() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.active).toBe(false);
    expect(updatedWith).toMatchObject({ active: false });
  });
});
