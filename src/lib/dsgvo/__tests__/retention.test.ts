/**
 * Tests für DSGVO-Retention-Routine (Phase 7 Task 5).
 * 10 Testfälle: anonymizeCandidate (7) + runRetention (3).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { anonymizeCandidate, runRetention } from '../retention';

// ---------------------------------------------------------------------------
// logAudit mock
// ---------------------------------------------------------------------------

vi.mock('@/lib/audit/log', () => ({
  logAudit: vi.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Chain-Mock helper
// ---------------------------------------------------------------------------

/**
 * Builds a chainable Supabase mock.
 * `tableQueues` maps table name → ordered response queue.
 * Popping order: each call to the terminal method (.single / plain await)
 * dequeues the next response. Falls back to { data: null, error: null }.
 *
 * `_updated` and `_deleted` track write calls for assertion.
 * `_storagePaths` tracks storage.remove calls.
 */
function makeSvc(tableQueues: Record<string, Array<{ data: unknown; error: unknown; count?: number | null }>> = {}) {
  const _updated: Record<string, unknown[]> = {};
  const _deleted: Record<string, unknown[]> = {};
  const _storagePaths: string[][] = [];
  const _inserts: Record<string, unknown[]> = {};

  function dequeue(table: string): { data: unknown; error: unknown; count?: number | null } {
    const q = tableQueues[table];
    if (q && q.length > 0) return q.shift()!;
    return { data: null, error: null };
  }

  const fromMock = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};

    // Build a terminal promise: when awaited it dequeues from the table.
    const terminal = () => Promise.resolve(dequeue(table));

    const methods = [
      'select', 'eq', 'is', 'in', 'lt', 'gt', 'gte', 'lte',
      'limit', 'filter', 'not', 'order', 'single', 'maybeSingle',
    ];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }

    // Make the chain itself awaitable (covers cases where code does `await svc.from(...).update(...)...eq(...)`)
    (chain as Record<string, unknown>).then = vi.fn(
      (resolve: (v: unknown) => void) => terminal().then(resolve)
    );

    // Override terminal methods
    (chain.single as ReturnType<typeof vi.fn>).mockImplementation(terminal);
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(terminal);

    // insert
    chain.insert = vi.fn((data: unknown) => {
      if (!_inserts[table]) _inserts[table] = [];
      _inserts[table].push(data);
      const insertChain = { ...chain };
      (insertChain as Record<string, unknown>).then = vi.fn(
        (resolve: (v: unknown) => void) => terminal().then(resolve)
      );
      return insertChain;
    });

    // update — returns a new chain that is also awaitable
    chain.update = vi.fn((data: unknown) => {
      if (!_updated[table]) _updated[table] = [];
      _updated[table].push(data);
      const updateChain: Record<string, unknown> = {};
      for (const m of ['eq', 'in', 'is', 'lt', 'gt', 'not', 'filter']) {
        updateChain[m] = vi.fn(() => updateChain);
      }
      (updateChain as Record<string, unknown>).then = vi.fn(
        (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve)
      );
      return updateChain;
    });

    // delete — returns a chain that is awaitable
    chain.delete = vi.fn(() => {
      if (!_deleted[table]) _deleted[table] = [];
      const deleteChain: Record<string, unknown> = {};
      for (const m of ['eq', 'in', 'is', 'lt', 'gt', 'not', 'filter']) {
        deleteChain[m] = vi.fn(() => deleteChain);
      }
      (deleteChain as Record<string, unknown>).then = vi.fn(
        (resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve)
      );
      return deleteChain;
    });

    return chain;
  });

  // storage mock
  const storageMock = {
    from: vi.fn((_bucket: string) => ({
      remove: vi.fn((paths: string[]) => {
        _storagePaths.push(paths);
        return Promise.resolve({ data: null, error: null });
      }),
    })),
  };

  const svc = {
    from: fromMock,
    storage: storageMock,
    _updated,
    _deleted,
    _storagePaths,
    _inserts,
  } as unknown as import('@supabase/supabase-js').SupabaseClient;

  return { svc, fromMock, _updated, _deleted, _storagePaths, _inserts };
}

// ---------------------------------------------------------------------------
// anonymizeCandidate tests
// ---------------------------------------------------------------------------

describe('anonymizeCandidate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. löscht documents-Dateien via storage.remove und documents-Zeilen (agency-gescoped)', async () => {
    const { svc, _storagePaths } = makeSvc({
      // applications fetch
      applications: [{ data: [{ id: 'app-1' }], error: null }],
      // documents fetch
      documents: [{ data: [{ id: 'doc-1', storage_path: 'agency-1/resume.pdf' }], error: null }],
      // conversations fetch
      conversations: [{ data: [], error: null }],
    });

    await anonymizeCandidate(svc, 'agency-1', 'cand-1', null);

    // storage.remove aufgerufen mit dem Pfad
    expect(_storagePaths.length).toBeGreaterThan(0);
    expect(_storagePaths[0]).toContain('agency-1/resume.pdf');

    // documents.delete aufgerufen
    expect(svc.from).toHaveBeenCalledWith('documents');
  });

  it('2. nullt application_answers (answer_raw, answer_normalized, question_text) für die Applications', async () => {
    const { svc, _updated } = makeSvc({
      applications: [{ data: [{ id: 'app-1' }], error: null }],
      documents: [{ data: [], error: null }],
      conversations: [{ data: [], error: null }],
    });

    await anonymizeCandidate(svc, 'agency-1', 'cand-1', null);

    const answerUpdates = _updated['application_answers'] ?? [];
    expect(answerUpdates.length).toBeGreaterThan(0);
    expect(answerUpdates[0]).toEqual(
      expect.objectContaining({ answer_raw: null, answer_normalized: null, question_text: null })
    );
  });

  it('3. nullt applications.summary und score_reasons (agency-gescoped)', async () => {
    const { svc, _updated } = makeSvc({
      applications: [{ data: [{ id: 'app-1' }], error: null }],
      documents: [{ data: [], error: null }],
      conversations: [{ data: [], error: null }],
    });

    await anonymizeCandidate(svc, 'agency-1', 'cand-1', null);

    const appUpdates = _updated['applications'] ?? [];
    expect(appUpdates.length).toBeGreaterThan(0);
    expect(appUpdates[0]).toEqual(
      expect.objectContaining({ summary: null, score_reasons: null })
    );
  });

  it('4. nullt messages.body/media_path über conversation_ids (agency-gescoped)', async () => {
    const { svc, _updated } = makeSvc({
      applications: [{ data: [], error: null }],
      conversations: [{ data: [{ id: 'conv-1' }], error: null }],
    });

    await anonymizeCandidate(svc, 'agency-1', 'cand-1', null);

    const msgUpdates = _updated['messages'] ?? [];
    expect(msgUpdates.length).toBeGreaterThan(0);
    expect(msgUpdates[0]).toEqual(
      expect.objectContaining({ body: null, media_path: null })
    );
  });

  it("5. setzt notes.text auf 'Anonymisiert (DSGVO)' via candidate_id", async () => {
    const { svc, _updated } = makeSvc({
      applications: [{ data: [], error: null }],
      conversations: [{ data: [], error: null }],
    });

    await anonymizeCandidate(svc, 'agency-1', 'cand-1', null);

    const noteUpdates = _updated['notes'] ?? [];
    expect(noteUpdates.length).toBeGreaterThan(0);
    expect(noteUpdates[0]).toEqual(
      expect.objectContaining({ text: 'Anonymisiert (DSGVO)' })
    );
  });

  it('6. anonymisiert candidates-PII-Felder und setzt anonymized_at (agency-gescoped)', async () => {
    const { svc, _updated } = makeSvc({
      applications: [{ data: [], error: null }],
      conversations: [{ data: [], error: null }],
    });

    await anonymizeCandidate(svc, 'agency-1', 'cand-1', null);

    const candUpdates = _updated['candidates'] ?? [];
    expect(candUpdates.length).toBeGreaterThan(0);
    const update = candUpdates[0] as Record<string, unknown>;
    expect(update.name).toBe('Anonymisiert');
    expect(update.email).toBeNull();
    expect(update.phone).toBeNull();
    expect(update.phone_e164).toBeNull();
    expect(update.location).toBeNull();
    expect(update.resume_url).toBeNull();
    expect(typeof update.anonymized_at).toBe('string');
  });

  it("7. ruft logAudit mit action 'anonymize' und korrekten Felder auf", async () => {
    const { svc } = makeSvc({
      applications: [{ data: [], error: null }],
      conversations: [{ data: [], error: null }],
    });

    const { logAudit } = await import('@/lib/audit/log');

    await anonymizeCandidate(svc, 'agency-1', 'cand-1', 'user-99');

    expect(logAudit).toHaveBeenCalledWith(
      svc,
      expect.objectContaining({
        action: 'anonymize',
        entity_type: 'candidate',
        entity_id: 'cand-1',
        agency_id: 'agency-1',
        user_id: 'user-99',
      })
    );
  });
});

// ---------------------------------------------------------------------------
// runRetention tests
// ---------------------------------------------------------------------------

describe('runRetention', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('8. Agentur mit retention_days null → Default 180 im Cutoff (kein Fehler)', async () => {
    // Agentur ohne retention_days → null; kein Kandidat → checked=0, anonymized=0
    const { svc } = makeSvc({
      agencies: [{ data: [{ id: 'ag-1', retention_days: null }], error: null }],
      candidates: [{ data: [], error: null }],
    });

    const result = await runRetention(svc);

    // Keine Exception, Zähler korrekt
    expect(result.checked).toBe(0);
    expect(result.anonymized).toBe(0);
  });

  it('9. Kandidat mit offener Application → übersprungen, Zähler checked=1 anonymized=0', async () => {
    const { svc } = makeSvc({
      agencies: [{ data: [{ id: 'ag-1', retention_days: 180 }], error: null }],
      candidates: [{ data: [{ id: 'cand-1' }], error: null }],
      // openCount check → count: 1
      applications: [
        { data: null, error: null, count: 1 },
      ],
    });

    const result = await runRetention(svc);

    expect(result.checked).toBe(1);
    expect(result.anonymized).toBe(0);
  });

  it('10. Kandidat alt + keine offenen Applications → anonymisiert, Zähler checked=1 anonymized=1', async () => {
    const { svc } = makeSvc({
      agencies: [{ data: [{ id: 'ag-1', retention_days: 180 }], error: null }],
      candidates: [{ data: [{ id: 'cand-2' }], error: null }],
      // openCount check → count: 0 (no open applications)
      applications: [
        { data: null, error: null, count: 0 },
        // recent check → empty
        { data: [], error: null },
        // anonymizeCandidate inner applications fetch
        { data: [], error: null },
      ],
      conversations: [{ data: [], error: null }],
    });

    const result = await runRetention(svc);

    expect(result.checked).toBe(1);
    expect(result.anonymized).toBe(1);
  });
});
