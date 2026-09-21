/**
 * Tests für POST /api/bot/simulate
 * Phase 3 Task 10 — Testmodus-API für den KI-Vorqualifizierungsbot
 *
 * Simulation läuft OHNE DB-Schreibzugriffe auf conversations/messages/application_answers.
 * Nur ai_calls wird geloggt (best effort, purpose 'simulate').
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// --- Mocks (hoisted, vor den Imports) ---

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
  llmJsonCall: vi.fn(),
  DIALOG_MODEL: 'claude-haiku-4-5',
}));

import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { llmJsonCall } from '@/lib/ai/llm-client';
import { POST } from '../simulate/route';

// --- Konstanten ---

const AGENCY_ID  = '00000000-0000-4000-8000-000000000001';
const USER_ID    = '00000000-0000-4000-8000-000000000002';
const JOB_ID     = '00000000-0000-4000-8000-000000000003';
const CONFIG_ID  = '00000000-0000-4000-8000-000000000004';

// --- Hilfsfunktionen ---

function makePostRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/bot/simulate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeMalformedRequest(): NextRequest {
  return new NextRequest('http://localhost/api/bot/simulate', {
    method: 'POST',
    body: 'kein { json',
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'update', 'insert', 'delete', 'upsert', 'order', 'filter', 'in', 'neq']) {
    chain[m] = self;
  }
  chain['single']      = () => Promise.resolve(result);
  chain['maybeSingle'] = () => Promise.resolve(result);
  chain['then'] = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

// --- Testdaten ---

const mockConfig = {
  id:               CONFIG_ID,
  agency_id:        AGENCY_ID,
  persona:          'freundliche Recruiterin',
  tone:             'warm, klar',
  formality:        'du',
  language:         'de',
  allowed_languages: ['de'],
  intro_text:       'Hallo! Kurz ein paar Fragen.',
  faq:              [],
  max_turns:        10,
  handover_rules:   {},
  scoring_rules:    { a_min: 80, b_min: 50 },
  active:           true,
  created_at:       '2026-01-01T00:00:00Z',
  updated_at:       '2026-01-01T00:00:00Z',
};

const mockJob = {
  id:            JOB_ID,
  agency_id:     AGENCY_ID,
  title:         'Testjob',
  description:   'Beschreibung',
  location:      'Berlin',
  bot_config_id: CONFIG_ID,
};

const mockAgency = {
  id:   AGENCY_ID,
  name: 'Test Agentur',
};

const mockQuestions = [
  {
    id:            'q-1',
    agency_id:     AGENCY_ID,
    bot_config_id: CONFIG_ID,
    position:      0,
    key:           'fuehrerschein',
    text:          'Hast du einen Führerschein?',
    type:          'yes_no',
    options:       null,
    required:      true,
    knockout_rule: { equals: false },
    weight:        3,
    created_at:    '2026-01-01T00:00:00Z',
    updated_at:    '2026-01-01T00:00:00Z',
  },
  {
    id:            'q-2',
    agency_id:     AGENCY_ID,
    bot_config_id: CONFIG_ID,
    position:      1,
    key:           'starttermin',
    text:          'Ab wann könntest du starten?',
    type:          'date',
    options:       null,
    required:      true,
    knockout_rule: null,
    weight:        1,
    created_at:    '2026-01-01T00:00:00Z',
    updated_at:    '2026-01-01T00:00:00Z',
  },
];

const mockDialogOutput = {
  intent:             'answer' as const,
  answers:            [{ question_key: 'fuehrerschein', value: true, confidence: 0.95, evidence: 'ja' }],
  needs_clarification: false,
  reply_text:         'Super, danke! Ab wann könntest du starten?',
  handover:           false,
  handover_reason:    null,
};

/** Baut ein SVC-Mock mit fester Table→Chain-Zuordnung */
function makeSvcMock(tableMap: Record<string, ReturnType<typeof makeChain>>) {
  return {
    from: (table: string) => tableMap[table] ?? makeChain({ data: null, error: null }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

/** Standard-SVC-Mock für Erfolgsfall */
function makeDefaultSvc() {
  return makeSvcMock({
    jobs:       makeChain({ data: mockJob,     error: null }),
    agencies:   makeChain({ data: mockAgency,  error: null }),
    bot_configs: makeChain({ data: mockConfig, error: null }),
    bot_questions: makeChain({ data: mockQuestions, error: null }),
  });
}

// ============================================================
// Tests
// ============================================================

describe('POST /api/bot/simulate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
    vi.mocked(canWriteRole).mockReturnValue(true);
    vi.mocked(createAdminClient).mockReturnValue(makeDefaultSvc());
    vi.mocked(llmJsonCall).mockResolvedValue(mockDialogOutput);
  });

  // ----------------------------------------------------------------
  // Auth-Kette
  // ----------------------------------------------------------------

  it('S1: gibt 401 zurück wenn nicht eingeloggt', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await POST(makePostRequest({ job_id: JOB_ID, history: [], collected: [] }));
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Nicht autorisiert');
  });

  it('S2: gibt 403 zurück wenn keine Schreibrechte', async () => {
    vi.mocked(canWriteRole).mockReturnValue(false);
    const res = await POST(makePostRequest({ job_id: JOB_ID, history: [], collected: [] }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Keine Schreibrechte');
  });

  it('S3: gibt 403 zurück wenn keine Agentur', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);
    const res = await POST(makePostRequest({ job_id: JOB_ID, history: [], collected: [] }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Keine Agentur');
  });

  it('S4: gibt 400 zurück bei ungültigem JSON', async () => {
    const res = await POST(makeMalformedRequest());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Ungültiger Request-Body');
  });

  // ----------------------------------------------------------------
  // Kein Bot konfiguriert
  // ----------------------------------------------------------------

  it('S5: gibt 400 "Kein Bot konfiguriert" wenn Job kein bot_config_id hat', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        jobs: makeChain({ data: { ...mockJob, bot_config_id: null }, error: null }),
        agencies: makeChain({ data: mockAgency, error: null }),
      })
    );
    const res = await POST(makePostRequest({ job_id: JOB_ID, history: [], collected: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Kein Bot konfiguriert');
  });

  it('S6: gibt 400 "Kein Bot konfiguriert" wenn bot_config vorhanden aber null (config: null)', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        jobs: makeChain({ data: mockJob, error: null }),
        agencies: makeChain({ data: mockAgency, error: null }),
        bot_configs: makeChain({ data: null, error: null }),
        bot_questions: makeChain({ data: [], error: null }),
      })
    );
    const res = await POST(makePostRequest({ job_id: JOB_ID, history: [], collected: [] }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Kein Bot konfiguriert');
  });

  it('S7: Testmodus funktioniert auch wenn config.active = false (nur config: null blockt)', async () => {
    const inactiveConfig = { ...mockConfig, active: false };
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        jobs: makeChain({ data: mockJob, error: null }),
        agencies: makeChain({ data: mockAgency, error: null }),
        bot_configs: makeChain({ data: inactiveConfig, error: null }),
        bot_questions: makeChain({ data: mockQuestions, error: null }),
      })
    );
    const res = await POST(makePostRequest({ job_id: JOB_ID, history: [], collected: [] }));
    expect(res.status).toBe(200);
  });

  it('S8: gibt 404 zurück wenn Job nicht gefunden', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcMock({
        jobs: makeChain({ data: null, error: null }),
        agencies: makeChain({ data: mockAgency, error: null }),
      })
    );
    const res = await POST(makePostRequest({ job_id: JOB_ID, history: [], collected: [] }));
    expect(res.status).toBe(404);
  });

  // ----------------------------------------------------------------
  // LLM-Antwort + collected-Aktualisierung
  // ----------------------------------------------------------------

  it('S9: LLM gemockt — Antwort liefert reply + output + aktualisiertes collected', async () => {
    const res = await POST(makePostRequest({
      job_id: JOB_ID,
      history: [{ role: 'bot', text: 'Hallo! Hast du einen Führerschein?' }],
      collected: [],
    }));

    expect(res.status).toBe(200);
    const json = await res.json();

    // Pflichtfelder in der Antwort
    expect(typeof json.reply).toBe('string');
    expect(json.reply).toBe('Super, danke! Ab wann könntest du starten?');
    expect(json.output).toBeDefined();
    expect(json.output.intent).toBe('answer');

    // collected aktualisiert
    expect(Array.isArray(json.collected)).toBe(true);
    const collectedKey = json.collected.find(
      (c: { question_key: string }) => c.question_key === 'fuehrerschein'
    );
    expect(collectedKey).toBeDefined();
    expect(collectedKey.value).toBe(true);
  });

  it('S10: kein DB-Schreibzugriff auf conversations/messages/application_answers', async () => {
    const writtenTables: string[] = [];

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        for (const m of ['eq', 'order', 'neq', 'filter', 'in', 'select']) {
          chain[m] = self;
        }
        chain['insert'] = () => {
          writtenTables.push(table);
          // ai_calls insert ist erlaubt
          return Promise.resolve({ data: null, error: null });
        };
        chain['update'] = () => {
          writtenTables.push(`update:${table}`);
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        };
        chain['delete'] = () => {
          writtenTables.push(`delete:${table}`);
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        };
        chain['single'] = () => {
          if (table === 'jobs')        return Promise.resolve({ data: mockJob, error: null });
          if (table === 'agencies')    return Promise.resolve({ data: mockAgency, error: null });
          if (table === 'bot_configs') return Promise.resolve({ data: mockConfig, error: null });
          return Promise.resolve({ data: null, error: null });
        };
        chain['then'] = (resolve: (v: unknown) => void) => {
          if (table === 'bot_questions') resolve({ data: mockQuestions, error: null });
          else resolve({ data: null, error: null });
        };
        return chain;
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    await POST(makePostRequest({ job_id: JOB_ID, history: [], collected: [] }));

    // Keine verbotenen Schreiboperationen
    expect(writtenTables).not.toContain('conversations');
    expect(writtenTables).not.toContain('messages');
    expect(writtenTables).not.toContain('application_answers');
    expect(writtenTables.filter(t => t.startsWith('update:conversations'))).toHaveLength(0);
  });

  // ----------------------------------------------------------------
  // done: true + score wenn alle required-Fragen beantwortet
  // ----------------------------------------------------------------

  it('S11: done: true + score wenn alle required-Fragen in collected vorhanden', async () => {
    // Alle required-Fragen bereits beantwortet
    const fullyCollected = [
      { question_key: 'fuehrerschein', value: true },
      { question_key: 'starttermin',   value: '2026-11-01' },
    ];

    const res = await POST(makePostRequest({
      job_id: JOB_ID,
      history: [
        { role: 'bot',       text: 'Hallo!' },
        { role: 'candidate', text: 'Ja, ich habe einen Führerschein.' },
        { role: 'bot',       text: 'Ab wann könntest du starten?' },
        { role: 'candidate', text: '01.11.2026' },
      ],
      collected: fullyCollected,
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.done).toBe(true);
    expect(json.score).toBeDefined();
    expect(typeof json.score.score).toBe('number');
    expect(['A', 'B', 'C']).toContain(json.score.label);
  });

  it('S12: done: false wenn noch nicht alle required-Fragen in collected vorhanden', async () => {
    // Nur eine von zwei required-Fragen beantwortet
    const partialCollected = [
      { question_key: 'fuehrerschein', value: true },
    ];

    const res = await POST(makePostRequest({
      job_id: JOB_ID,
      history: [
        { role: 'bot',       text: 'Hallo!' },
        { role: 'candidate', text: 'Ja, Führerschein habe ich.' },
      ],
      collected: partialCollected,
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.done).toBe(false);
    expect(json.score).toBeUndefined();
  });

  it('S13: llmJsonCall wird mit purpose "simulate" und conversationId null aufgerufen', async () => {
    await POST(makePostRequest({ job_id: JOB_ID, history: [], collected: [] }));

    expect(vi.mocked(llmJsonCall)).toHaveBeenCalledOnce();
    const callArgs = vi.mocked(llmJsonCall).mock.calls[0][1];
    expect(callArgs.purpose).toBe('simulate');
    expect(callArgs.conversationId).toBeNull();
  });

  it('S14: collected wird mit Antworten aus LLM-output.answers zusammengeführt', async () => {
    // LLM gibt zwei Antworten zurück
    vi.mocked(llmJsonCall).mockResolvedValue({
      ...mockDialogOutput,
      answers: [
        { question_key: 'fuehrerschein', value: true,   confidence: 0.95, evidence: 'ja' },
        { question_key: 'starttermin',   value: '2026-11-01', confidence: 0.8, evidence: 'november' },
      ],
    });

    const res = await POST(makePostRequest({
      job_id: JOB_ID,
      history: [],
      collected: [],
    }));

    expect(res.status).toBe(200);
    const json = await res.json();

    // Beide Antworten in collected
    const keys = json.collected.map((c: { question_key: string }) => c.question_key);
    expect(keys).toContain('fuehrerschein');
    expect(keys).toContain('starttermin');
    // done: true weil beide required-Fragen nun in collected
    expect(json.done).toBe(true);
    expect(json.score).toBeDefined();
  });

  it('S15: bestehende collected-Einträge bleiben erhalten, neue werden hinzugefügt', async () => {
    // fuehrerschein schon in collected; LLM antwortet mit starttermin
    vi.mocked(llmJsonCall).mockResolvedValue({
      ...mockDialogOutput,
      answers: [
        { question_key: 'starttermin', value: '2026-11-01', confidence: 0.8, evidence: 'november' },
      ],
    });

    const res = await POST(makePostRequest({
      job_id: JOB_ID,
      history: [{ role: 'candidate', text: 'Ja, Führerschein habe ich.' }],
      collected: [{ question_key: 'fuehrerschein', value: true }],
    }));

    expect(res.status).toBe(200);
    const json = await res.json();
    const keys = json.collected.map((c: { question_key: string }) => c.question_key);
    expect(keys).toContain('fuehrerschein');
    expect(keys).toContain('starttermin');
  });
});
