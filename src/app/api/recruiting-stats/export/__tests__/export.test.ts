/**
 * Tests für GET /api/recruiting-stats/export
 * Prüft Auth (401/403), Validierung (400), Content-Type, Content-Disposition,
 * BOM-Präfix und korrekte Header-Zeile im CSV.
 */

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
const AGENCY_ID  = '00000000-0000-4000-8000-000000000001';
const USER_ID    = '00000000-0000-4000-8000-000000000005';
const JOB_ID_1   = '00000000-0000-4000-8001-000000000001';
const APP_ID_1   = '00000000-0000-4000-8002-000000000001';
const STAGE_ID_1 = '00000000-0000-4000-8004-000000000001';

// --- Hilfsfunktionen ---
function makeRequest(params: Record<string, string> = {}): NextRequest {
  const qs = new URLSearchParams({
    from: '2026-09-01',
    to:   '2026-09-30',
    ...params,
  }).toString();
  return new NextRequest(`http://localhost/api/recruiting-stats/export?${qs}`, { method: 'GET' });
}

/** Minimaler chainbarer Supabase-Mock — gibt leere Datensätze zurück */
function buildMinimalMockClient() {
  const makeSimpleTable = (data: object[] = []) => ({
    select: () => ({
      eq: () => ({
        gte: () => ({ lte: () => ({ then: (r: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(r) }) }),
        in:  () => Promise.resolve({ data, error: null }),
        then: (r: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(r),
      }),
      in: () => Promise.resolve({ data, error: null }),
    }),
  });

  const MOCK_STAGE = { id: STAGE_ID_1, stage_type: 'screening' };
  const MOCK_APP = {
    id: APP_ID_1,
    job_id: JOB_ID_1,
    source: 'indeed',
    score_label: 'A',
    score_reasons: [],
    status: 'new',
    stage_id: STAGE_ID_1,
    applied_at: '2026-09-10T10:00:00Z',
    assigned_to: null,
  };
  const MOCK_JOB = { id: JOB_ID_1, title: 'Verkäufer (m/w/d)', status: 'active' };

  let appCallCount = 0;

  return {
    from: (table: string) => {
      if (table === 'pipeline_stages') {
        return {
          select: () => ({
            eq: () => Promise.resolve({ data: [MOCK_STAGE], error: null }),
          }),
        };
      }

      if (table === 'applications') {
        appCallCount++;
        const rows = appCallCount === 1 ? [MOCK_APP] : [];
        const inner: Record<string, unknown> = {};
        inner['gte'] = () => inner;
        inner['lte'] = () => inner;
        inner['eq']  = () => inner;
        inner['then'] = (r: (v: unknown) => unknown) =>
          Promise.resolve({ data: rows, error: null }).then(r);
        return { select: () => ({ eq: () => inner }) };
      }

      if (table === 'jobs') {
        return {
          select: () => ({
            eq: () => ({
              in: () => Promise.resolve({ data: [MOCK_JOB], error: null }),
            }),
            in: () => Promise.resolve({ data: [MOCK_JOB], error: null }),
          }),
        };
      }

      // conversations, messages, appointments → leer
      return makeSimpleTable();
    },
  } as unknown as ReturnType<typeof createAdminClient>;
}

// --- Tests ---

describe('GET /api/recruiting-stats/export', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'test@test.de', name: 'Test', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
    vi.mocked(createAdminClient).mockReturnValue(buildMinimalMockClient());
  });

  // --- Auth-Fehler ---

  it('401 ohne angemeldeten Nutzer', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(401);
  });

  it('403 ohne Agentur-Zuordnung', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);
    const res = await GET(makeRequest());
    expect(res.status).toBe(403);
  });

  // --- Validierungsfehler ---

  it('400 wenn from fehlt', async () => {
    const req = new NextRequest('http://localhost/api/recruiting-stats/export?to=2026-09-30');
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('400 bei ungültigem from-Format', async () => {
    const res = await GET(makeRequest({ from: 'gestern' }));
    expect(res.status).toBe(400);
  });

  it('400 bei ungültigem source-Enum', async () => {
    const res = await GET(makeRequest({ source: 'twitter' }));
    expect(res.status).toBe(400);
  });

  // --- Happy-Path ---

  it('200 mit Content-Type text/csv; charset=utf-8', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const ct = res.headers.get('content-type') ?? '';
    expect(ct.toLowerCase()).toContain('text/csv');
    expect(ct.toLowerCase()).toContain('charset=utf-8');
  });

  it('Content-Disposition: attachment; filename="jobs-statistik.csv"', async () => {
    const res = await GET(makeRequest());
    expect(res.status).toBe(200);
    const cd = res.headers.get('content-disposition') ?? '';
    expect(cd).toContain('attachment');
    expect(cd).toContain('filename="jobs-statistik.csv"');
  });

  it('Antwort-Body beginnt mit UTF-8-BOM-Bytes (EF BB BF)', async () => {
    const res = await GET(makeRequest());
    // res.text() strips BOM per Fetch-Spec — daher arrayBuffer prüfen
    const buf = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    expect(bytes[0]).toBe(0xef);
    expect(bytes[1]).toBe(0xbb);
    expect(bytes[2]).toBe(0xbf);
  });

  it('Body enthält exakte Header-Zeile nach BOM', async () => {
    const res = await GET(makeRequest());
    // arrayBuffer: BOM-Bytes (EF BB BF) sind Bytes 0–2, danach folgt der CSV-Text
    const buf = await res.arrayBuffer();
    // BOM-Bytes überspringen, Rest als UTF-8 dekodieren
    const textAfterBom = new TextDecoder('utf-8').decode(buf.slice(3));
    const firstLine = textAfterBom.split('\r\n')[0];
    expect(firstLine).toBe('Job;Status;Bewerbungen;Antwortquote;Qualifiziert;Termine;Einstellungen');
  });

  it('Body enthält mindestens eine Datenzeile mit dem Mock-Job', async () => {
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).toContain('Verkäufer (m/w/d)');
  });

  it('Antwortquote null wird als leerer String (nicht "null") exportiert', async () => {
    const res = await GET(makeRequest());
    const text = await res.text();
    // "null" darf nirgends erscheinen
    expect(text.toLowerCase()).not.toContain(';null;');
    expect(text.toLowerCase()).not.toContain(';null\r\n');
  });

  it('Zeilen enden mit CRLF', async () => {
    const res = await GET(makeRequest());
    const text = await res.text();
    expect(text).toContain('\r\n');
  });
});
