/**
 * Tests für GET + PATCH /api/admin/meta-pricing (Phase 6 Task 7).
 * Auth: 401/403, GET-Liste, PATCH Erfolg, PATCH 404 unbekannte Kategorie, PATCH 400 ungültiger Preis.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks ---
vi.mock('@/lib/auth', () => ({
  getCurrentUser: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { GET, PATCH } from '../route';

// --- Konstanten ---
const AGENCY_ID = '00000000-0000-4000-8000-000000000001';

const MOCK_ADMIN_USER = {
  id: 'user-admin-1',
  email: 'admin@test.de',
  name: 'Admin',
  role: 'admin' as const,
  agency_id: null,
};

const MOCK_AGENCY_OWNER = {
  id: 'user-owner-1',
  email: 'owner@test.de',
  name: 'Inhaber',
  role: 'agency_owner' as const,
  agency_id: AGENCY_ID,
};

const MOCK_PRICING_ROWS = [
  { id: 'p1', category: 'marketing', price_eur: 0.12, updated_at: '2026-09-01T00:00:00Z' },
  { id: 'p2', category: 'utility',   price_eur: 0.06, updated_at: '2026-09-01T00:00:00Z' },
];

/** Erstellt einen chainbaren Supabase-Mock. */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'update', 'order', 'insert', 'upsert']) {
    chain[m] = self;
  }
  chain['maybeSingle'] = () => Promise.resolve(result);
  chain['single']      = () => Promise.resolve(result);
  chain['then']        = (resolve: (v: unknown) => unknown) =>
    Promise.resolve(result).then(resolve);
  return chain;
}

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/meta-pricing', { method: 'GET' });
}

function makePatchRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/meta-pricing', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// Auth-Guards
// ---------------------------------------------------------------------------

describe('GET /api/admin/meta-pricing — Auth', () => {
  it('gibt 401 zurück wenn kein User', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
  });

  it('gibt 403 zurück wenn User kein Admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_AGENCY_OWNER);
    const res = await GET(makeGetRequest());
    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/admin/meta-pricing — Auth', () => {
  it('gibt 401 zurück wenn kein User', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await PATCH(makePatchRequest({ category: 'utility', price_eur: 0.05 }));
    expect(res.status).toBe(401);
  });

  it('gibt 403 zurück wenn User kein Admin', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_AGENCY_OWNER);
    const res = await PATCH(makePatchRequest({ category: 'utility', price_eur: 0.05 }));
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET — Erfolg
// ---------------------------------------------------------------------------

describe('GET /api/admin/meta-pricing', () => {
  it('gibt 200 mit pricing-Array zurück', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const mockClient = {
      from: () => makeChain({ data: MOCK_PRICING_ROWS, error: null }),
    };
    vi.mocked(createAdminClient).mockReturnValue(mockClient as never);

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toHaveProperty('pricing');
    expect(body.pricing).toHaveLength(2);
    expect(body.pricing[0].category).toBe('marketing');
  });
});

// ---------------------------------------------------------------------------
// PATCH — Validierung und Erfolg
// ---------------------------------------------------------------------------

describe('PATCH /api/admin/meta-pricing', () => {
  it('gibt 200 mit aktualisierter Zeile zurück', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const updatedRow = { id: 'p2', category: 'utility', price_eur: 0.07, updated_at: '2026-09-21T00:00:00Z' };
    const mockClient = {
      from: () => makeChain({ data: updatedRow, error: null }),
    };
    vi.mocked(createAdminClient).mockReturnValue(mockClient as never);

    const res = await PATCH(makePatchRequest({ category: 'utility', price_eur: 0.07 }));
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.pricing.price_eur).toBe(0.07);
    expect(body.pricing.category).toBe('utility');
  });

  it('gibt 404 zurück wenn Kategorie unbekannt', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const mockClient = {
      from: () => makeChain({ data: null, error: null }),
    };
    vi.mocked(createAdminClient).mockReturnValue(mockClient as never);

    const res = await PATCH(makePatchRequest({ category: 'unbekannte_kategorie', price_eur: 0.05 }));
    expect(res.status).toBe(404);
  });

  it('gibt 400 zurück wenn price_eur negativ', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const res = await PATCH(makePatchRequest({ category: 'utility', price_eur: -1 }));
    expect(res.status).toBe(400);
  });

  it('gibt 400 zurück wenn price_eur > 10', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const res = await PATCH(makePatchRequest({ category: 'utility', price_eur: 11 }));
    expect(res.status).toBe(400);
  });

  it('gibt 400 zurück wenn category fehlt', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const res = await PATCH(makePatchRequest({ price_eur: 0.05 }));
    expect(res.status).toBe(400);
  });

  it('gibt 400 zurück wenn category ein Leerstring ist', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const res = await PATCH(makePatchRequest({ category: '', price_eur: 0.05 }));
    expect(res.status).toBe(400);
  });

  it('gibt 400 zurück wenn price_eur kein Number ist', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const res = await PATCH(makePatchRequest({ category: 'utility', price_eur: 'viel' }));
    expect(res.status).toBe(400);
  });

  it('gibt 400 zurück wenn price_eur genau 10 ist (Grenzwert — gültig)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const updatedRow = { id: 'p2', category: 'utility', price_eur: 10, updated_at: '2026-09-21T00:00:00Z' };
    const mockClient = {
      from: () => makeChain({ data: updatedRow, error: null }),
    };
    vi.mocked(createAdminClient).mockReturnValue(mockClient as never);

    const res = await PATCH(makePatchRequest({ category: 'utility', price_eur: 10 }));
    // price_eur=10 ist max=10 → gültig → 200
    expect(res.status).toBe(200);
  });

  it('gibt 400 zurück wenn price_eur genau 0 ist (Grenzwert — gültig)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const updatedRow = { id: 'p2', category: 'utility', price_eur: 0, updated_at: '2026-09-21T00:00:00Z' };
    const mockClient = {
      from: () => makeChain({ data: updatedRow, error: null }),
    };
    vi.mocked(createAdminClient).mockReturnValue(mockClient as never);

    const res = await PATCH(makePatchRequest({ category: 'utility', price_eur: 0 }));
    // price_eur=0 ist min=0 → gültig → 200
    expect(res.status).toBe(200);
  });
});
