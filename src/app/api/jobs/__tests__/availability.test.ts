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
import { GET, PUT } from '../[id]/availability/route';

// --- Konstanten ---
const AGENCY_ID = '00000000-0000-4000-8000-000000000001';
const JOB_ID    = '00000000-0000-4000-8000-000000000002';
const USER_ID   = '00000000-0000-4000-8000-000000000003';

// --- Hilfsfunktionen ---
function makeParams(id = JOB_ID): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

function makeGetRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/jobs/${JOB_ID}/availability`, {
    method: 'GET',
  });
}

function makePutRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/jobs/${JOB_ID}/availability`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeMalformedPutRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/jobs/${JOB_ID}/availability`, {
    method: 'PUT',
    body: 'dies ist { kein json',
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Erstellt einen chainbaren Supabase-Query-Mock.
 * Alle Filter-/Mutationsmethoden geben `this` zurück.
 * `.single()` und Endauflösungen geben das übergebene Ergebnis zurück.
 */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'update', 'insert', 'delete', 'order', 'upsert', 'filter', 'in', 'maybeSingle']) {
    chain[m] = self;
  }
  chain['single'] = () => Promise.resolve(result);
  // Direktes await auf die Chain (für delete/insert ohne single())
  chain['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return chain;
}

function makeSvcMock(tableMap: Record<string, ReturnType<typeof makeChain>>) {
  return {
    from: (table: string) => tableMap[table] ?? makeChain({ data: null, error: null }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

// --- Tests ---

describe('GET /api/jobs/[id]/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
  });

  it('401 ohne Auth', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await GET(makeGetRequest(), { params: makeParams() });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Nicht autorisiert');
  });

  it('403 ohne Agentur', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);

    const res = await GET(makeGetRequest(), { params: makeParams() });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Agentur');
  });

  it('liefert Regeln und Job-Einstellungen', async () => {
    const mockRules = [
      { id: 'r1', agency_id: AGENCY_ID, job_id: JOB_ID, weekday: 1, start_time: '09:00:00', end_time: '17:00:00', created_at: '', updated_at: '' },
    ];
    const mockJob = {
      appointment_type: 'video',
      appointment_location: 'https://meet.example.com',
      appointment_duration_minutes: 45,
      appointment_buffer_minutes: 10,
    };

    // availability_rules-Chain: order().order() → Promise.resolve({ data: rules })
    const rulesChain = makeChain({ data: mockRules, error: null });
    const jobChain = makeChain({ data: mockJob, error: null });

    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({ availability_rules: rulesChain, jobs: jobChain })
    );

    const res = await GET(makeGetRequest(), { params: makeParams() });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(Array.isArray(json.rules)).toBe(true);
    expect(json.rules).toHaveLength(1);
    expect(json.rules[0].weekday).toBe(1);
    expect(json.job).toBeDefined();
    expect(json.job.appointment_type).toBe('video');
    expect(json.job.appointment_duration_minutes).toBe(45);
  });
});

describe('PUT /api/jobs/[id]/availability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canWriteRole).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
  });

  it('401 ohne Auth', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);

    const res = await PUT(makePutRequest({ rules: [] }), { params: makeParams() });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Nicht autorisiert');
  });

  it('403 ohne Schreibrechte', async () => {
    vi.mocked(canWriteRole).mockReturnValue(false);

    const res = await PUT(makePutRequest({ rules: [] }), { params: makeParams() });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Schreibrechte');
  });

  it('403 ohne Agentur', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);

    const res = await PUT(makePutRequest({ rules: [] }), { params: makeParams() });

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Keine Agentur');
  });

  it('400 bei ungültigem JSON', async () => {
    const res = await PUT(makeMalformedPutRequest(), { params: makeParams() });

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe('Ungültiger Request-Body');
  });

  it('400 bei ungültigem Wochentag (weekday=7)', async () => {
    const res = await PUT(
      makePutRequest({ rules: [{ weekday: 7, start_time: '09:00:00', end_time: '17:00:00' }] }),
      { params: makeParams() }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Wochentag/);
  });

  it('400 bei ungültiger Zeitspanne (start >= end)', async () => {
    const res = await PUT(
      makePutRequest({ rules: [{ weekday: 1, start_time: '17:00:00', end_time: '09:00:00' }] }),
      { params: makeParams() }
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Zeitspanne/);
  });

  it('löscht bestehende Regeln und fügt neue ein', async () => {
    const deleteSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() });
    const insertSpy = vi.fn().mockResolvedValue({ data: null, error: null });
    const updateSpy = vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis() });

    let deleteCallCount = 0;
    let insertCallCount = 0;

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'availability_rules') {
          return {
            delete: () => {
              deleteCallCount++;
              return { eq: vi.fn().mockReturnThis(), then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r) };
            },
            insert: (rows: unknown) => {
              insertCallCount++;
              return Promise.resolve({ data: null, error: null });
            },
          };
        }
        if (table === 'jobs') {
          return {
            update: updateSpy,
          };
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(
      makePutRequest({ rules: [{ weekday: 1, start_time: '09:00:00', end_time: '12:00:00' }] }),
      { params: makeParams() }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(deleteCallCount).toBe(1);
    expect(insertCallCount).toBe(1);
  });

  it('aktualisiert Job-Spalten (appointment_type etc.)', async () => {
    const updateSpy = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnThis(),
    });

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'availability_rules') {
          return {
            delete: () => ({
              eq: vi.fn().mockReturnThis(),
              then: (r: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null }).then(r),
            }),
            insert: () => Promise.resolve({ data: null, error: null }),
          };
        }
        if (table === 'jobs') {
          return { update: updateSpy };
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(
      makePutRequest({ rules: [], appointment_type: 'video', appointment_duration_minutes: 45 }),
      { params: makeParams() }
    );

    expect(res.status).toBe(200);
    expect(updateSpy).toHaveBeenCalledOnce();
    const updateArg = updateSpy.mock.calls[0][0];
    expect(updateArg).toHaveProperty('appointment_type', 'video');
    expect(updateArg).toHaveProperty('appointment_duration_minutes', 45);
  });
});
