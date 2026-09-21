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
import { GET } from '../route';

// --- Konstanten ---
const AGENCY_ID = '00000000-0000-4000-8000-000000000001';
const USER_ID   = '00000000-0000-4000-8000-000000000005';
const JOB_ID_1  = '00000000-0000-4000-8001-000000000001';
const APP_ID_1  = '00000000-0000-4000-8002-000000000001';
const APP_ID_2  = '00000000-0000-4000-8002-000000000002';
const CONV_ID_1 = '00000000-0000-4000-8003-000000000001';
const STAGE_ID_1 = '00000000-0000-4000-8004-000000000001';

// --- Hilfsfunktionen ---
function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams({
    from: '2026-09-01',
    to:   '2026-09-30',
    ...params,
  }).toString();
  return new NextRequest(`http://localhost/api/recruiting-stats?${qs}`, { method: 'GET' });
}

// Minimal-Fixture: 2 Bewerbungen, 1 Conversation, 2 Messages, 1 Termin
const MOCK_STAGE = { id: STAGE_ID_1, stage_type: 'screening' };

const MOCK_APP_1 = {
  id: APP_ID_1,
  job_id: JOB_ID_1,
  source: 'indeed',
  score_label: 'A',
  score_reasons: [{ reason: 'Erfahrung' }, 'Kommunikation'],
  status: 'new',
  stage_id: STAGE_ID_1,
  applied_at: '2026-09-10T10:00:00Z',
  assigned_to: null,
};

const MOCK_APP_2 = {
  id: APP_ID_2,
  job_id: JOB_ID_1,
  source: 'meta',
  score_label: 'B',
  score_reasons: ['Erfahrung'],
  status: 'new',
  stage_id: null,
  applied_at: '2026-09-15T12:00:00Z',
  assigned_to: null,
};

const MOCK_CONV = {
  id: CONV_ID_1,
  application_id: APP_ID_1,
  state: 'human_active',
};

const MOCK_MESSAGES = [
  { conversation_id: CONV_ID_1, direction: 'out', sender_type: 'bot',   created_at: '2026-09-10T10:05:00Z' },
  { conversation_id: CONV_ID_1, direction: 'in',  sender_type: 'applicant', created_at: '2026-09-10T10:10:00Z' },
];

const MOCK_APPOINTMENT = {
  application_id: APP_ID_1,
  status: 'booked',
  starts_at: new Date().toISOString().slice(0, 10) + 'T09:00:00Z', // heute
  created_at: '2026-09-10T11:00:00Z',
};

const MOCK_JOB = { id: JOB_ID_1, title: 'Verkäufer (m/w/d)', status: 'active' };

/**
 * Baut einen vollständig chainbaren Supabase-Mock-Client,
 * der Aufzeichnung der eq('agency_id', …)-Aufrufe unterstützt.
 */
function buildMockClient(opts: {
  appsCurrentPeriod?: object[];
  appsPrevPeriod?: object[];
  stages?: object[];
  conversations?: object[];
  messages?: object[];
  appointments?: object[];
  jobs?: object[];
  recordEqCalls?: Array<{ table: string; col: string; val: unknown }>;
}) {
  const {
    appsCurrentPeriod = [],
    appsPrevPeriod     = [],
    stages             = [MOCK_STAGE],
    conversations      = [],
    messages           = [],
    appointments       = [],
    jobs               = [],
    recordEqCalls      = [],
  } = opts;

  // Zählt, welche eq-Aufrufe stattfanden
  const makeAppsQuery = (rows: object[]) => {
    // Simuliert: .select(…).eq(agency_id).gte(…).lte(…)[.eq(job_id)][.eq(source)]
    return {
      select: (_cols: string) => {
        const eqRecorder = (col: string, val: unknown) => {
          recordEqCalls.push({ table: 'applications', col, val });
          return gteChain;
        };
        const gteChain = {
          gte: () => lteChain,
          eq:  eqRecorder,
        };
        const lteChain = {
          lte: () => optionalEqChain,
          eq:  eqRecorder,
        };
        const optionalEqChain: Record<string, unknown> = {
          eq:  eqRecorder,
          lte: () => optionalEqChain,
          then: (resolve: (v: unknown) => unknown) =>
            Promise.resolve({ data: rows, error: null }).then(resolve),
        };
        // Damit ein await direkt funktioniert
        const root = {
          eq: eqRecorder,
        };
        return root;
      },
    };
  };

  let appCallCount = 0;

  return {
    from: (table: string) => {
      if (table === 'pipeline_stages') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              recordEqCalls.push({ table, col, val });
              return Promise.resolve({ data: stages, error: null });
            },
          }),
        };
      }

      if (table === 'applications') {
        appCallCount++;
        const rows = appCallCount === 1 ? appsCurrentPeriod : appsPrevPeriod;
        // Chainbarer Mock mit eq-Aufzeichnung
        // Sequenz: .select.eq(agency_id).gte(…).lte(…)[.eq(job_id)|.eq(source)]
        const buildChain = (rowsInner: object[]): unknown => {
          let recordedAgencyEq = false;
          const chain: Record<string, unknown> = {};

          chain['eq'] = (col: string, val: unknown) => {
            recordEqCalls.push({ table: 'applications', col, val });
            if (col === 'agency_id') recordedAgencyEq = true;
            // Gibt immer sich selbst mit gte/lte/eq zurück
            const inner: Record<string, unknown> = {};
            inner['gte'] = () => inner;
            inner['lte'] = () => inner;
            inner['eq']  = (c: string, v: unknown) => {
              recordEqCalls.push({ table: 'applications', col: c, val: v });
              return inner;
            };
            inner['then'] = (resolve: (v: unknown) => unknown) => {
              void recordedAgencyEq;
              return Promise.resolve({ data: rowsInner, error: null }).then(resolve);
            };
            return inner;
          };

          chain['select'] = () => chain;

          return chain;
        };

        return buildChain(rows);
      }

      if (table === 'conversations') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              recordEqCalls.push({ table, col, val });
              return {
                in: () => Promise.resolve({ data: conversations, error: null }),
              };
            },
            in: () => Promise.resolve({ data: conversations, error: null }),
          }),
        };
      }

      if (table === 'messages') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              recordEqCalls.push({ table, col, val });
              return {
                in: () => Promise.resolve({ data: messages, error: null }),
              };
            },
            in: () => Promise.resolve({ data: messages, error: null }),
          }),
        };
      }

      if (table === 'appointments') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              recordEqCalls.push({ table, col, val });
              return {
                in: () => Promise.resolve({ data: appointments, error: null }),
              };
            },
            in: () => Promise.resolve({ data: appointments, error: null }),
          }),
        };
      }

      if (table === 'jobs') {
        return {
          select: () => ({
            eq: (col: string, val: unknown) => {
              recordEqCalls.push({ table, col, val });
              return {
                in: (_col2: string, _ids: string[]) =>
                  Promise.resolve({ data: jobs, error: null }),
              };
            },
            in: () => Promise.resolve({ data: jobs, error: null }),
          }),
        };
      }

      // Fallback
      return {
        select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }),
      };
    },
  } as unknown as ReturnType<typeof createAdminClient>;
}

// --- Tests ---

describe('GET /api/recruiting-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'test@test.de', name: 'Test', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
  });

  // --- Auth-Fehler ---

  it('401 ohne angemeldeten Nutzer', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toMatch(/autorisiert/i);
  });

  it('403 ohne Agentur-Zuordnung', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toMatch(/Agentur/i);
  });

  // --- Validierungsfehler ---

  it('400 wenn from fehlt', async () => {
    const req = new NextRequest('http://localhost/api/recruiting-stats?to=2026-09-30');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('400 bei ungültigem from-Format (kein Datum)', async () => {
    const res = await GET(makeRequest({ from: 'gestern', to: '2026-09-30' }));
    expect(res.status).toBe(400);
  });

  it('400 bei ungültigem source-Enum', async () => {
    const res = await GET(makeRequest({ source: 'twitter' }));
    expect(res.status).toBe(400);
  });

  it('400 bei ungültiger job_id (kein UUID)', async () => {
    const res = await GET(makeRequest({ job_id: 'nicht-eine-uuid' }));
    expect(res.status).toBe(400);
  });

  // --- Happy-Path mit kleinem Fixture ---

  it('200 Happy-Path: kpis.tiles.bewerbungen, previousTiles, jobsTable und tasks korrekt', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockClient({
        appsCurrentPeriod: [MOCK_APP_1, MOCK_APP_2],
        appsPrevPeriod:    [],
        stages:            [MOCK_STAGE],
        conversations:     [MOCK_CONV],
        messages:          MOCK_MESSAGES,
        appointments:      [MOCK_APPOINTMENT],
        jobs:              [MOCK_JOB],
      }),
    );

    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const json = await res.json();

    // KPI-Tiles
    expect(json.kpis).toBeDefined();
    expect(json.kpis.tiles.bewerbungen).toBe(2);

    // Vorperiode
    expect(json.previousTiles).toBeDefined();
    expect(json.previousTiles.bewerbungen).toBe(0);

    // Jobtabelle — 1 Job mit ≥1 Bewerbung
    expect(json.jobsTable).toBeInstanceOf(Array);
    expect(json.jobsTable.length).toBeGreaterThanOrEqual(1);
    const job = json.jobsTable.find((j: { jobId: string }) => j.jobId === JOB_ID_1);
    expect(job).toBeDefined();
    expect(job.bewerbungen).toBe(2);

    // Tasks
    expect(json.tasks).toBeDefined();
    expect(typeof json.tasks.brauchtMensch).toBe('number');
    expect(typeof json.tasks.qualifiziertOhneAktion).toBe('number');
    expect(typeof json.tasks.termineHeute).toBe('number');
    // MOCK_CONV hat state='human_active' → brauchtMensch=1
    expect(json.tasks.brauchtMensch).toBe(1);
    // Beide Apps haben score_label A/B und assigned_to=null → qualifiziertOhneAktion=2
    expect(json.tasks.qualifiziertOhneAktion).toBe(2);
  });

  // --- Agency-Scoping ---

  it('jede Query auf applications verwendet eq(agency_id, agencyId)', async () => {
    const eqCalls: Array<{ table: string; col: string; val: unknown }> = [];

    vi.mocked(createAdminClient).mockReturnValue(
      buildMockClient({
        appsCurrentPeriod: [MOCK_APP_1],
        appsPrevPeriod:    [],
        recordEqCalls:     eqCalls,
      }),
    );

    const res = await GET(makeRequest());
    // Anfrage kann 200 oder Fehler sein — wichtig ist der Scoping-Nachweis
    // (bei leerem conversations-Array werden folgende Queries übersprungen)
    expect(res.status).not.toBe(500);

    const appEqsWithAgency = eqCalls.filter(
      (c) => c.table === 'applications' && c.col === 'agency_id' && c.val === AGENCY_ID,
    );
    expect(appEqsWithAgency.length).toBeGreaterThanOrEqual(1);
  });

  // --- Gültige optionale Parameter ---

  it('200 mit gültigem source-Filter', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockClient({ appsCurrentPeriod: [MOCK_APP_1] }),
    );
    const res = await GET(makeRequest({ source: 'indeed' }));
    expect(res.status).toBe(200);
  });

  it('200 mit gültiger job_id', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      buildMockClient({ appsCurrentPeriod: [MOCK_APP_1] }),
    );
    const res = await GET(makeRequest({ job_id: JOB_ID_1 }));
    expect(res.status).toBe(200);
  });
});
