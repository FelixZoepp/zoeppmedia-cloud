import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ingestApplication, type IngestInput } from '../ingest';

// ---------------------------------------------------------------------------
// Mock infrastructure
// ---------------------------------------------------------------------------

// Mock fireEvent — must be hoisted before any import resolution
vi.mock('@/lib/automations/fire', () => ({
  fireEvent: vi.fn().mockResolvedValue(undefined),
}));

// Mock logActivity so it does not hit a real DB
vi.mock('@/lib/activity/log', () => ({
  logActivity: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Builds a fake Supabase client whose `.from(table)` chain is stateful.
 *
 * Key design: each call to `.from()` captures the table name in `currentTable`
 * and returns a fresh chain. The chain's terminal methods (.single /
 * .maybeSingle) use `responders` — a map from table name to a queue of
 * canned responses.  This lets individual tests push exact responses without
 * needing a real database.
 */
function createMockClient() {
  // Per-table response queues: shift() returns next response for that table.
  const responders: Record<string, Array<{ data: unknown; error: unknown }>> = {};

  // Fallback when no response is queued
  const defaultResponse = { data: null, error: null };

  function nextResponse(table: string) {
    const queue = responders[table];
    if (queue && queue.length > 0) return queue.shift()!;
    return defaultResponse;
  }

  let currentTable = '';

  // Storage for side-effects (insert / upsert calls) so tests can assert them
  const state = {
    candidates: [] as Record<string, unknown>[],
    applications: [] as Record<string, unknown>[],
    applicationAnswers: [] as Record<string, unknown>[],
    documents: [] as Record<string, unknown>[],
    activityLog: [] as Record<string, unknown>[],
    candidateStages: [] as Record<string, unknown>[],
  };

  function buildChain(): Record<string, unknown> {
    const chain: Record<string, unknown> = {};

    chain.select = vi.fn().mockReturnValue(chain);

    chain.insert = vi.fn().mockImplementation(
      (data: Record<string, unknown> | Record<string, unknown>[]) => {
        const rows = Array.isArray(data) ? data : [data];
        if (currentTable === 'candidates') {
          rows.forEach((r) => {
            const row = { ...r, id: r.id ?? `cand-${Math.random().toString(36).slice(2, 8)}` };
            state.candidates.push(row);
          });
        } else if (currentTable === 'applications') {
          rows.forEach((r) => {
            const row = { ...r, id: r.id ?? `app-${Math.random().toString(36).slice(2, 8)}` };
            state.applications.push(row);
          });
        } else if (currentTable === 'application_answers') {
          rows.forEach((r) => state.applicationAnswers.push(r));
        } else if (currentTable === 'documents') {
          rows.forEach((r) => state.documents.push(r));
        } else if (currentTable === 'activity_log') {
          rows.forEach((r) => state.activityLog.push(r));
        } else if (currentTable === 'candidate_stages') {
          rows.forEach((r) => state.candidateStages.push(r));
        }
        return chain;
      }
    );

    chain.update = vi.fn().mockReturnValue(chain);

    chain.upsert = vi.fn().mockImplementation(
      (data: Record<string, unknown> | Record<string, unknown>[]) => {
        if (currentTable === 'application_answers') {
          const rows = Array.isArray(data) ? data : [data];
          rows.forEach((r) => state.applicationAnswers.push(r));
        }
        return chain;
      }
    );

    chain.eq = vi.fn().mockReturnValue(chain);
    chain.is = vi.fn().mockReturnValue(chain);
    chain.gte = vi.fn().mockReturnValue(chain);
    chain.neq = vi.fn().mockReturnValue(chain);
    chain.ilike = vi.fn().mockReturnValue(chain);
    chain.not = vi.fn().mockReturnValue(chain);
    chain.order = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);

    chain.single = vi.fn().mockImplementation(() => {
      // For candidates insert: return the last inserted candidate
      if (currentTable === 'candidates' && state.candidates.length > 0) {
        return { data: state.candidates[state.candidates.length - 1], error: null };
      }
      // For applications insert: return the last inserted application
      if (currentTable === 'applications' && state.applications.length > 0) {
        return { data: state.applications[state.applications.length - 1], error: null };
      }
      return nextResponse(currentTable);
    });

    chain.maybeSingle = vi.fn().mockImplementation(() => {
      return nextResponse(currentTable);
    });

    return chain;
  }

  const client = {
    from: vi.fn().mockImplementation((table: string) => {
      currentTable = table;
      return buildChain();
    }),
    // Helpers for tests
    _state: state,
    _responders: responders,
    _enqueue(table: string, response: { data: unknown; error: unknown }) {
      if (!responders[table]) responders[table] = [];
      responders[table].push(response);
    },
    _reset() {
      state.candidates = [];
      state.applications = [];
      state.applicationAnswers = [];
      state.documents = [];
      state.activityLog = [];
      state.candidateStages = [];
      Object.keys(responders).forEach((k) => delete responders[k]);
    },
  };

  return client;
}

// ---------------------------------------------------------------------------
// Shared base input — uses valid RFC 4122 v4 UUIDs required by zod schema
// ---------------------------------------------------------------------------
const BASE_AGENCY_ID = 'a1b2c3d4-e5f6-4a7b-89c0-d1e2f3a4b5c6';
const BASE_JOB_ID = 'b2c3d4e5-f6a7-4b8c-90d1-e2f3a4b5c6d7';

const baseInput: IngestInput = {
  agencyId: BASE_AGENCY_ID,
  jobId: BASE_JOB_ID,
  firstName: 'Max',
  lastName: 'Mustermann',
  phone: '0176 1234567',
  email: 'max@test.de',
  source: 'form',
  consentWhatsapp: true,
  consentSource: 'form',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ingestApplication', () => {
  let client: ReturnType<typeof createMockClient>;

  beforeEach(() => {
    client = createMockClient();
    vi.clearAllMocks();

    // Default pipeline_stages response: always return stage-new for maybeSingle
    // This is queued once per test; the function calls getNewStageId once.
    client._enqueue('pipeline_stages', { data: { id: 'stage-new' }, error: null });
  });

  // -------------------------------------------------------------------------
  // 1. Happy Path: neue Kandidat + neue Bewerbung
  // -------------------------------------------------------------------------
  it('Happy Path: legt neuen Kandidaten + Bewerbung an', async () => {
    // pipeline_stages already queued in beforeEach
    // All other maybeSingle calls return null (no existing candidate, no duplicate)

    const result = await ingestApplication(client as never, baseInput);

    expect(result.candidateCreated).toBe(true);
    expect(result.applicationCreated).toBe(true);
    expect(result.duplicateWithin30Days).toBe(false);
    expect(result.phoneInvalid).toBe(false);
    expect(typeof result.candidateId).toBe('string');
    expect(typeof result.applicationId).toBe('string');

    // candidates-Insert wurde ausgefuehrt
    expect(client._state.candidates).toHaveLength(1);
    expect(client._state.candidates[0]).toMatchObject({
      agency_id: BASE_AGENCY_ID,
      source: 'form',
    });

    // applications-Insert wurde ausgefuehrt
    expect(client._state.applications).toHaveLength(1);
    expect(client._state.applications[0]).toMatchObject({
      agency_id: BASE_AGENCY_ID,
      job_id: BASE_JOB_ID,
      status: 'open',
    });
  });

  // -------------------------------------------------------------------------
  // 2. 30-Tage-Duplikat
  // -------------------------------------------------------------------------
  it('30-Tage-Duplikat: gibt bestehende applicationId zurueck, kein neuer Insert', async () => {
    const existingCandidateId = 'cand-existing-001';
    const existingAppId = 'app-existing-001';

    // pipeline_stages (queued in beforeEach)
    // candidates maybeSingle → bestehender Kandidat per phone_e164
    client._enqueue('candidates', {
      data: { id: existingCandidateId, phone_e164: '+4917612345678', email: 'max@test.de' },
      error: null,
    });
    // candidates single (consent check) → no whatsapp_opt_in
    client._enqueue('candidates', { data: { whatsapp_opt_in: false, consent_at: null }, error: null });
    // applications maybeSingle (30-Tage-Check) → bereits vorhandene Bewerbung
    client._enqueue('applications', { data: { id: existingAppId }, error: null });

    const result = await ingestApplication(client as never, baseInput);

    expect(result.duplicateWithin30Days).toBe(true);
    expect(result.applicationCreated).toBe(false);
    expect(result.applicationId).toBe(existingAppId);
    expect(result.candidateId).toBe(existingCandidateId);
    expect(result.candidateCreated).toBe(false);

    // Kein neuer candidates-Insert
    expect(client._state.candidates).toHaveLength(0);
    // Kein neuer applications-Insert
    expect(client._state.applications).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 3. Ungueltige Telefonnummer
  // -------------------------------------------------------------------------
  it('Ungueltige Telefonnummer: phoneInvalid=true, Ingest laeuft trotzdem durch', async () => {
    // pipeline_stages already queued in beforeEach
    const invalidInput: IngestInput = {
      ...baseInput,
      phone: 'abc', // ungueltig
    };

    const result = await ingestApplication(client as never, invalidInput);

    expect(result.phoneInvalid).toBe(true);
    // Ingest laeuft trotzdem durch — neuer Kandidat angelegt (kein phone_e164 match moeglich)
    expect(result.candidateCreated).toBe(true);
    expect(result.applicationCreated).toBe(true);
  });

  // -------------------------------------------------------------------------
  // 4. source_ref-Idempotenz
  // -------------------------------------------------------------------------
  it('source_ref-Idempotenz: sofortiger Return ohne neue Inserts', async () => {
    const existingCandidateId = 'cand-src-001';
    const existingAppId = 'app-src-001';

    // applications maybeSingle (source_ref-Check) → Treffer
    client._enqueue('applications', {
      data: { id: existingAppId, candidate_id: existingCandidateId },
      error: null,
    });

    const inputWithRef: IngestInput = {
      ...baseInput,
      sourceRef: 'indeed-ref-xyz',
    };

    const result = await ingestApplication(client as never, inputWithRef);

    expect(result.applicationCreated).toBe(false);
    expect(result.candidateCreated).toBe(false);
    expect(result.applicationId).toBe(existingAppId);
    expect(result.candidateId).toBe(existingCandidateId);
    expect(result.duplicateWithin30Days).toBe(false);

    // Keine neuen Inserts
    expect(client._state.candidates).toHaveLength(0);
    expect(client._state.applications).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // 5. Bestehender Kandidat (Match per phone_e164), kein 30-Tage-Duplikat
  // -------------------------------------------------------------------------
  it('Bestehender Kandidat per phone_e164, kein Duplikat: applicationCreated=true, candidateCreated=false', async () => {
    const existingCandidateId = 'cand-phone-match-001';

    // pipeline_stages (queued in beforeEach)
    // candidates maybeSingle → bestehender Kandidat
    client._enqueue('candidates', {
      data: { id: existingCandidateId, phone_e164: '+4917612345678', email: 'max@test.de' },
      error: null,
    });
    // candidates single (consent check) → kein opt-in
    client._enqueue('candidates', { data: { whatsapp_opt_in: false, consent_at: null }, error: null });
    // applications maybeSingle (30-Tage-Check) → kein Duplikat
    // (no enqueue needed — default returns null)

    const result = await ingestApplication(client as never, baseInput);

    expect(result.candidateCreated).toBe(false);
    expect(result.applicationCreated).toBe(true);
    expect(result.duplicateWithin30Days).toBe(false);
    expect(result.candidateId).toBe(existingCandidateId);
    expect(typeof result.applicationId).toBe('string');

    // Kein neuer Kandidat, aber eine neue Application
    expect(client._state.candidates).toHaveLength(0);
    expect(client._state.applications).toHaveLength(1);
  });
});
