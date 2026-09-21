/**
 * Tests für DSGVO-Export (Phase 7 Task 6).
 * 6 Testfälle: buildDsgvoExport (4) + renderDsgvoPdf (1) + Scoping (1).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildDsgvoExport, renderDsgvoPdf } from '../export';

// ---------------------------------------------------------------------------
// Chain-Mock helper (gleicher Ansatz wie retention.test.ts)
// ---------------------------------------------------------------------------

function makeSvc(
  tableQueues: Record<string, Array<{ data: unknown; error: unknown; count?: number | null }>> = {}
) {
  const _callLog: Array<{ table: string; method: string; arg?: unknown }> = [];

  function dequeue(
    table: string
  ): { data: unknown; error: unknown; count?: number | null } {
    const q = tableQueues[table];
    if (q && q.length > 0) return q.shift()!;
    return { data: null, error: null };
  }

  const fromMock = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};

    const terminal = () => Promise.resolve(dequeue(table));

    const methods = [
      'select',
      'eq',
      'is',
      'in',
      'lt',
      'gt',
      'gte',
      'lte',
      'limit',
      'filter',
      'not',
      'order',
      'single',
      'maybeSingle',
    ];
    for (const m of methods) {
      chain[m] = vi.fn((...args: unknown[]) => {
        _callLog.push({ table, method: m, arg: args[0] });
        return chain;
      });
    }

    // Make chain itself awaitable
    (chain as Record<string, unknown>).then = vi.fn(
      (resolve: (v: unknown) => void) => terminal().then(resolve)
    );

    // Override terminal methods
    (chain.single as ReturnType<typeof vi.fn>).mockImplementation(terminal);
    (chain.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(terminal);

    return chain;
  });

  const svc = {
    from: fromMock,
    _callLog,
  } as unknown as import('@supabase/supabase-js').SupabaseClient & {
    _callLog: typeof _callLog;
  };

  return { svc, fromMock, _callLog };
}

// ---------------------------------------------------------------------------
// Tests: buildDsgvoExport
// ---------------------------------------------------------------------------

describe('buildDsgvoExport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('1. Kandidat fremder Agentur / nicht vorhanden → null', async () => {
    const { svc } = makeSvc({
      // candidates gibt null zurück (maybeSingle liefert { data: null })
      candidates: [{ data: null, error: null }],
    });

    const result = await buildDsgvoExport(svc, 'agency-other', 'cand-unknown');
    expect(result).toBeNull();
  });

  it('2. Vollständiger Export: Stammdaten, applications, answers, messages, notes', async () => {
    const candidate = {
      id: 'cand-1',
      agency_id: 'agency-1',
      name: 'Max Mustermann',
      email: 'max@example.com',
      whatsapp_opt_in: true,
      consent_version: 2,
      consent_text: 'Ich stimme zu.',
      consent_at: '2026-01-01T00:00:00Z',
      consent_source: 'funnel_form',
    };
    const applications = [{ id: 'app-1', agency_id: 'agency-1', candidate_id: 'cand-1', status: 'open', created_at: '2026-01-02T00:00:00Z' }];
    const answers = [{ id: 'ans-1', application_id: 'app-1', answer_raw: 'Antwort A' }];
    const conversations = [{ id: 'conv-1', agency_id: 'agency-1', candidate_id: 'cand-1' }];
    const messages = [{ id: 'msg-1', agency_id: 'agency-1', conversation_id: 'conv-1', direction: 'inbound', created_at: '2026-01-03T00:00:00Z', body: 'Hallo' }];
    const notes = [{ id: 'note-1', candidate_id: 'cand-1', text: 'Notiz' }];

    const { svc } = makeSvc({
      candidates: [{ data: candidate, error: null }],
      applications: [{ data: applications, error: null }],
      application_answers: [{ data: answers, error: null }],
      conversations: [{ data: conversations, error: null }],
      messages: [{ data: messages, error: null }],
      notes: [{ data: notes, error: null }],
    });

    const result = await buildDsgvoExport(svc, 'agency-1', 'cand-1');

    expect(result).not.toBeNull();
    expect(result!.candidate).toMatchObject({ id: 'cand-1', name: 'Max Mustermann' });
    expect(result!.applications).toHaveLength(1);
    expect(result!.answers).toHaveLength(1);
    expect(result!.messages).toHaveLength(1);
    expect(result!.notes).toHaveLength(1);
    expect(typeof result!.exportedAt).toBe('string');
  });

  it('3. Consent-Felder werden korrekt aus candidate gemappt', async () => {
    const candidate = {
      id: 'cand-2',
      agency_id: 'agency-1',
      name: 'Anna Schmidt',
      email: 'anna@example.com',
      whatsapp_opt_in: false,
      consent_version: 3,
      consent_text: 'Text',
      consent_at: '2026-02-01T00:00:00Z',
      consent_source: 'manual',
    };

    const { svc } = makeSvc({
      candidates: [{ data: candidate, error: null }],
      applications: [{ data: [], error: null }],
      application_answers: [{ data: [], error: null }],
      conversations: [{ data: [], error: null }],
      messages: [{ data: [], error: null }],
      notes: [{ data: [], error: null }],
    });

    const result = await buildDsgvoExport(svc, 'agency-1', 'cand-2');

    expect(result).not.toBeNull();
    expect(result!.consent).toEqual({
      optIn: false,
      version: 3,
      text: 'Text',
      at: '2026-02-01T00:00:00Z',
      source: 'manual',
    });
  });

  it('4. Agency-Scoping: candidates-Query verwendet .eq(agency_id) UND .eq(id)', async () => {
    // Wir prüfen, dass die kandidaten-Query agency-gescoped ist.
    // Kandidat existiert, aber callLog muss eq('agency_id', ...) zeigen.
    const candidate = { id: 'cand-3', agency_id: 'agency-1', name: 'Testperson', whatsapp_opt_in: true, consent_version: null, consent_text: null, consent_at: null, consent_source: null };

    const { svc, _callLog } = makeSvc({
      candidates: [{ data: candidate, error: null }],
      applications: [{ data: [], error: null }],
      application_answers: [{ data: [], error: null }],
      conversations: [{ data: [], error: null }],
      messages: [{ data: [], error: null }],
      notes: [{ data: [], error: null }],
    });

    await buildDsgvoExport(svc, 'agency-1', 'cand-3');

    // candidates-Tabelle muss eq mit 'agency_id' aufgerufen haben
    const candidateCalls = _callLog.filter((c) => c.table === 'candidates');
    const agencyEq = candidateCalls.find((c) => c.method === 'eq' && c.arg === 'agency_id');
    expect(agencyEq).toBeDefined();

    // applications-Tabelle muss eq mit 'agency_id' aufgerufen haben
    const appCalls = _callLog.filter((c) => c.table === 'applications');
    const appAgencyEq = appCalls.find((c) => c.method === 'eq' && c.arg === 'agency_id');
    expect(appAgencyEq).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// Tests: renderDsgvoPdf
// ---------------------------------------------------------------------------

describe('renderDsgvoPdf', () => {
  it('5. Gibt Uint8Array zurück, beginnt mit PDF-Magic-Bytes %PDF', async () => {
    const exportData = {
      exportedAt: '2026-09-21T00:00:00Z',
      candidate: { id: 'cand-1', name: 'Max Mustermann', email: 'max@example.com' },
      consent: { optIn: true, version: 1, text: 'Zustimmung', at: '2026-01-01T00:00:00Z', source: 'funnel_form' as const },
      applications: [{ id: 'app-1', status: 'open', created_at: '2026-01-02T00:00:00Z' }],
      answers: [{ id: 'ans-1', answer_raw: 'Antwort' }],
      messages: [{ direction: 'inbound', created_at: '2026-01-03T00:00:00Z', body: 'Hallo Welt' }],
      notes: [{ text: 'Notiz' }],
    };

    const pdfBytes = await renderDsgvoPdf(exportData);

    expect(pdfBytes).toBeInstanceOf(Uint8Array);
    // PDF-Magic-Bytes: %PDF → ASCII 37 80 68 70
    expect(pdfBytes[0]).toBe(0x25); // %
    expect(pdfBytes[1]).toBe(0x50); // P
    expect(pdfBytes[2]).toBe(0x44); // D
    expect(pdfBytes[3]).toBe(0x46); // F
  });

  it('6. Emojis und nicht-WinAnsi-Zeichen im body führen nicht zu einem Fehler', async () => {
    const exportData = {
      exportedAt: '2026-09-21T00:00:00Z',
      candidate: { id: 'cand-emoji', name: 'Tüv Müller', email: 'test@example.com' },
      consent: { optIn: false, version: null, text: null, at: null, source: null },
      applications: [],
      answers: [],
      messages: [
        { direction: 'inbound', created_at: '2026-01-01T00:00:00Z', body: 'Hi 😀🎉 schön!' },
        { direction: 'outbound', created_at: '2026-01-02T00:00:00Z', body: 'Hallo Ö-straße' },
      ],
      notes: [],
    };

    // Darf keinen Fehler werfen
    await expect(renderDsgvoPdf(exportData)).resolves.toBeInstanceOf(Uint8Array);
  });
});
