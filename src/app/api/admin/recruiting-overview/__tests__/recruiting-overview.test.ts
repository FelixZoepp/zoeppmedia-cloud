/**
 * Tests für GET /api/admin/recruiting-overview (Phase 6 Task 7).
 * Auth-Kette: 401 ohne User, 403 als agency_owner, 200 Happy-Path.
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

vi.mock('@/lib/kpi/agency-overview', () => ({
  getAgencyOverview: vi.fn(),
}));

import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getAgencyOverview } from '@/lib/kpi/agency-overview';
import { GET } from '../route';

// --- Konstanten ---
const AGENCY_ID = '00000000-0000-4000-8000-000000000001';

const MOCK_ADMIN_USER = {
  id: 'user-admin-1',
  email: 'admin@test.de',
  name: 'Admin',
  role: 'admin' as const,
  agency_id: null,
};

const MOCK_AGENCY_OWNER_USER = {
  id: 'user-owner-1',
  email: 'owner@test.de',
  name: 'Agenturinhaber',
  role: 'agency_owner' as const,
  agency_id: AGENCY_ID,
};

const MOCK_OVERVIEW_ROW = {
  agencyId: AGENCY_ID,
  name: 'Muster GmbH',
  activeJobs: 3,
  apps7: 10,
  apps30: 42,
  antwortquote30: 0.72,
  qualifizierungsquote30: 0.6,
  termine30: 5,
  letzteAktivitaet: '2026-09-20T10:00:00Z',
  ampel: 'gruen',
  whatsapp: { status: 'connected', qualityRating: 'GREEN', messagingLimit: 'TIER_1K', rejectedTemplates: 0 },
  alarms: [],
  usageMonth: {
    messagesOut: 200,
    templatesByCategory: { utility: 50 },
    metaCostEur: 3.0,
    aiInputTokens: 5000,
    aiOutputTokens: 2000,
    aiCostUsd: 0.25,
  },
};

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/admin/recruiting-overview', { method: 'GET' });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/recruiting-overview', () => {
  it('gibt 401 zurück wenn kein User eingeloggt', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('gibt 403 zurück wenn User kein Admin ist', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_AGENCY_OWNER_USER);

    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('gibt 200 mit agencies-Array und month zurück (Happy-Path)', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const mockClient = { from: vi.fn() };
    vi.mocked(createAdminClient).mockReturnValue(mockClient as never);
    vi.mocked(getAgencyOverview).mockResolvedValue([MOCK_OVERVIEW_ROW as never]);

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toHaveProperty('agencies');
    expect(body).toHaveProperty('month');
    expect(body.agencies).toHaveLength(1);

    const row = body.agencies[0];
    expect(row.agencyId).toBe(AGENCY_ID);
    expect(row.apps30).toBe(42);
    expect(row.ampel).toBe('gruen');
    expect(row.alarms).toHaveLength(0);
    expect(row.usageMonth.metaCostEur).toBe(3.0);
  });

  it('übergibt monthStart im Format YYYY-MM-01 an getAgencyOverview', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    const mockClient = { from: vi.fn() };
    vi.mocked(createAdminClient).mockReturnValue(mockClient as never);
    vi.mocked(getAgencyOverview).mockResolvedValue([]);

    await GET(makeRequest());

    expect(getAgencyOverview).toHaveBeenCalledTimes(1);
    const [, monthStart] = vi.mocked(getAgencyOverview).mock.calls[0];
    expect(monthStart).toMatch(/^\d{4}-\d{2}-01$/);
  });
});
