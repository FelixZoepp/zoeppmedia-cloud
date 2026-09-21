/**
 * Tests für GET /api/jobs/[id]/bot und PUT /api/jobs/[id]/bot
 * Phase 3 Task 9 — Bot-Config-API mit Preset-Anwendung und Guardrail-Validierung
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

import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { GET, PUT } from '../[id]/bot/route';

// --- Konstanten ---

const AGENCY_ID   = '00000000-0000-4000-8000-000000000001';
const OTHER_AGENCY = '00000000-0000-4000-8000-000000000099';
const USER_ID     = '00000000-0000-4000-8000-000000000002';
const JOB_ID      = '00000000-0000-4000-8000-000000000003';
const CONFIG_ID   = '00000000-0000-4000-8000-000000000004';

// --- Hilfsfunktionen ---

function makeGetRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/jobs/${JOB_ID}/bot`);
}

function makePutRequest(body: unknown): NextRequest {
  return new NextRequest(`http://localhost/api/jobs/${JOB_ID}/bot`, {
    method: 'PUT',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeMalformedPutRequest(): NextRequest {
  return new NextRequest(`http://localhost/api/jobs/${JOB_ID}/bot`, {
    method: 'PUT',
    body: 'das ist { kein json',
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeParams(id = JOB_ID): Promise<{ id: string }> {
  return Promise.resolve({ id });
}

/**
 * Minimal-Supabase-Chain: Alle filter/mutate-Methoden geben `this` zurück.
 * .single() und .maybeSingle() lösen mit dem angegebenen Ergebnis auf.
 * Der Chain ist direkt `await`-bar (thenable).
 */
function makeChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'update', 'insert', 'delete', 'upsert', 'order', 'filter', 'in', 'neq']) {
    chain[m] = self;
  }
  chain['single']      = () => Promise.resolve(result);
  chain['maybeSingle'] = () => Promise.resolve(result);
  // Direkt await-bar für Queries ohne .single()
  chain['then'] = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

function makeSvcMock(tableMap: Record<string, ReturnType<typeof makeChain>>) {
  return {
    from: (table: string) => tableMap[table] ?? makeChain({ data: null, error: null }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

/** Für Routen, die from() mehrfach aufrufen — Reihenfolge bestimmt Mock */
function makeSvcCallOrderMock(calls: Array<ReturnType<typeof makeChain>>) {
  let idx = 0;
  return {
    from: () => calls[idx++] ?? makeChain({ data: null, error: null }),
  } as unknown as ReturnType<typeof createAdminClient>;
}

// --- Gültige Testdaten ---

const validConfig = {
  persona: 'freundliche Recruiterin',
  tone: 'warm, klar',
  formality: 'du' as const,
  language: 'de',
  intro_text: 'Hallo! Kurze Fragen, schnelle Rückmeldung.',
  faq: [{ q: 'Frage 1', a: 'Antwort 1' }],
  max_turns: 10,
  scoring_rules: { a_min: 8, b_min: 4 },
  active: true,
};

const validQuestions = [
  {
    key: 'fuehrerschein',
    text: 'Hast du einen Führerschein Klasse B?',
    type: 'yes_no' as const,
    required: true,
    knockout_rule: { equals: false },
    weight: 3,
  },
  {
    key: 'starttermin',
    text: 'Ab wann könntest du starten?',
    type: 'date' as const,
    required: true,
    weight: 1,
  },
];

// ============================================================
// GET /api/jobs/[id]/bot
// ============================================================

describe('GET /api/jobs/[id]/bot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
  });

  // --- Auth-Kette ---

  it('G1: gibt 401 zurück wenn nicht eingeloggt', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params: makeParams() });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Nicht autorisiert');
  });

  it('G2: gibt 403 zurück wenn keine Agentur', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);
    const res = await GET(makeGetRequest(), { params: makeParams() });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Keine Agentur');
  });

  // --- Job nicht gefunden / falsche Agentur ---

  it('G3: gibt 404 zurück wenn Job zu anderer Agentur gehört', async () => {
    // jobs-Query gibt null zurück (agency_id-Filter schlägt fehl)
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcCallOrderMock([
        makeChain({ data: null, error: null }), // jobs → not found
      ])
    );
    const res = await GET(makeGetRequest(), { params: makeParams() });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Job nicht gefunden');
  });

  // --- Kein Config vorhanden (config: null, questions: []) ---

  it('G4: gibt config: null, questions: [], presets mit 5 Einträgen zurück wenn kein Config', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') {
          // Job gefunden, bot_config_id ist null
          return makeChain({ data: { id: JOB_ID, bot_config_id: null }, error: null });
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeGetRequest(), { params: makeParams() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.config).toBeNull();
    expect(json.questions).toEqual([]);
    expect(Array.isArray(json.presets)).toBe(true);
    expect(json.presets).toHaveLength(5);
  });

  it('G5: presets enthält key und name für alle 5 Presets', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') {
          return makeChain({ data: { id: JOB_ID, bot_config_id: null }, error: null });
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeGetRequest(), { params: makeParams() });
    const json = await res.json();
    const presetKeys = json.presets.map((p: { key: string }) => p.key);
    expect(presetKeys).toContain('pflege');
    expect(presetKeys).toContain('logistik');
    expect(presetKeys).toContain('handwerk');
    expect(presetKeys).toContain('gastro');
    expect(presetKeys).toContain('vertrieb');
    json.presets.forEach((p: { key: string; name: string }) => {
      expect(typeof p.key).toBe('string');
      expect(typeof p.name).toBe('string');
    });
  });

  // --- Config vorhanden ---

  it('G6: gibt config + questions zurück wenn Config vorhanden', async () => {
    const mockConfig = {
      id: CONFIG_ID,
      agency_id: AGENCY_ID,
      persona: 'Recruiterin',
      tone: 'warm',
      formality: 'du',
      language: 'de',
      intro_text: 'Hallo!',
      faq: [],
      max_turns: 10,
      scoring_rules: { a_min: 8, b_min: 4 },
      active: true,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const mockQuestions = [
      { id: 'q-1', key: 'fuehrerschein', text: 'Führerschein?', type: 'yes_no', position: 0, required: true, options: null, knockout_rule: null, weight: 1 },
    ];

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') {
          return makeChain({ data: { id: JOB_ID, bot_config_id: CONFIG_ID }, error: null });
        }
        if (table === 'bot_configs') {
          return makeChain({ data: mockConfig, error: null });
        }
        if (table === 'bot_questions') {
          return makeChain({ data: mockQuestions, error: null });
        }
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await GET(makeGetRequest(), { params: makeParams() });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.config).not.toBeNull();
    expect(json.config.id).toBe(CONFIG_ID);
    expect(json.questions).toHaveLength(1);
    expect(json.questions[0].key).toBe('fuehrerschein');
  });
});

// ============================================================
// PUT /api/jobs/[id]/bot
// ============================================================

describe('PUT /api/jobs/[id]/bot', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canWriteRole).mockReturnValue(true);
    vi.mocked(getCurrentUser).mockResolvedValue({
      id: USER_ID, email: 'a@b.de', name: 'A', role: 'agency_member', agency_id: AGENCY_ID,
    });
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(AGENCY_ID);
  });

  // --- Auth-Kette ---

  it('P1: gibt 401 zurück wenn nicht eingeloggt', async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const res = await PUT(makePutRequest({ config: validConfig, questions: validQuestions }), { params: makeParams() });
    expect(res.status).toBe(401);
    expect((await res.json()).error).toBe('Nicht autorisiert');
  });

  it('P2: gibt 403 zurück wenn keine Schreibrechte', async () => {
    vi.mocked(canWriteRole).mockReturnValue(false);
    const res = await PUT(makePutRequest({ config: validConfig, questions: validQuestions }), { params: makeParams() });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Keine Schreibrechte');
  });

  it('P3: gibt 403 zurück wenn keine Agentur', async () => {
    vi.mocked(getEffectiveAgencyId).mockResolvedValue(null);
    const res = await PUT(makePutRequest({ config: validConfig, questions: validQuestions }), { params: makeParams() });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('Keine Agentur');
  });

  it('P4: gibt 400 zurück bei ungültigem JSON', async () => {
    const res = await PUT(makeMalformedPutRequest(), { params: makeParams() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Ungültiger Request-Body');
  });

  // --- Job nicht gefunden / falsche Agentur ---

  it('P5: gibt 404 zurück wenn Job zu anderer Agentur gehört', async () => {
    vi.mocked(createAdminClient).mockReturnValue(
      makeSvcCallOrderMock([
        makeChain({ data: null, error: null }), // jobs → not found
      ])
    );
    const res = await PUT(makePutRequest({ config: validConfig, questions: validQuestions }), { params: makeParams() });
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Job nicht gefunden');
  });

  // --- Zod-Validierungen ---

  it('P6: gibt 400 zurück wenn Frage-Keys doppelt sind', async () => {
    const questionsWithDuplicate = [
      { key: 'gleicher_key', text: 'Frage 1', type: 'yes_no', required: true, weight: 1 },
      { key: 'gleicher_key', text: 'Frage 2', type: 'text',   required: false, weight: 1 },
    ];

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') return makeChain({ data: { id: JOB_ID, bot_config_id: null }, error: null });
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(makePutRequest({ config: validConfig, questions: questionsWithDuplicate }), { params: makeParams() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Frage-Keys müssen eindeutig sein');
  });

  it('P7: gibt 400 zurück wenn max_turns unter 5 liegt', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') return makeChain({ data: { id: JOB_ID, bot_config_id: null }, error: null });
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(
      makePutRequest({ config: { ...validConfig, max_turns: 4 }, questions: validQuestions }),
      { params: makeParams() }
    );
    expect(res.status).toBe(400);
  });

  it('P8: gibt 400 zurück wenn max_turns über 50 liegt', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') return makeChain({ data: { id: JOB_ID, bot_config_id: null }, error: null });
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(
      makePutRequest({ config: { ...validConfig, max_turns: 51 }, questions: validQuestions }),
      { params: makeParams() }
    );
    expect(res.status).toBe(400);
  });

  it('P9: gibt 400 zurück wenn a_min <= b_min', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') return makeChain({ data: { id: JOB_ID, bot_config_id: null }, error: null });
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(
      makePutRequest({ config: { ...validConfig, scoring_rules: { a_min: 5, b_min: 5 } }, questions: validQuestions }),
      { params: makeParams() }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('A-Schwelle muss über B-Schwelle liegen');
  });

  it('P10: gibt 400 zurück wenn a_min < b_min', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') return makeChain({ data: { id: JOB_ID, bot_config_id: null }, error: null });
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(
      makePutRequest({ config: { ...validConfig, scoring_rules: { a_min: 3, b_min: 5 } }, questions: validQuestions }),
      { params: makeParams() }
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('A-Schwelle muss über B-Schwelle liegen');
  });

  it('P11: gibt 400 zurück wenn choice-Frage ohne options ist', async () => {
    const questionsNoOptions = [
      { key: 'wahl', text: 'Bitte wählen:', type: 'choice', required: true, weight: 1 },
      // options fehlt absichtlich
    ];

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') return makeChain({ data: { id: JOB_ID, bot_config_id: null }, error: null });
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(makePutRequest({ config: validConfig, questions: questionsNoOptions }), { params: makeParams() });
    expect(res.status).toBe(400);
  });

  // --- P3-R10: Verbotene Themen ---

  it('P12: gibt 400 zurück wenn Frage-Text ein verbotenes Thema berührt (Alter)', async () => {
    const forbiddenQuestion = [
      { key: 'alterscheck', text: 'Wie alt bist du?', type: 'text', required: false, weight: 1 },
    ];

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') return makeChain({ data: { id: JOB_ID, bot_config_id: null }, error: null });
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(makePutRequest({ config: validConfig, questions: forbiddenQuestion }), { params: makeParams() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Frage berührt ein verbotenes Thema');
  });

  it('P13: gibt 400 zurück wenn Frage-Key ein verbotenes Thema berührt (Schwangerschaft)', async () => {
    const forbiddenQuestion = [
      { key: 'schwanger_check', text: 'Sonstige Frage', type: 'yes_no', required: false, weight: 1 },
    ];

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        if (table === 'jobs') return makeChain({ data: { id: JOB_ID, bot_config_id: null }, error: null });
        return makeChain({ data: null, error: null });
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(makePutRequest({ config: validConfig, questions: forbiddenQuestion }), { params: makeParams() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Frage berührt ein verbotenes Thema');
  });

  // --- Preset-Anwendung ---

  it('P14: preset_key "vertrieb" → Fragen entsprechen dem Vertrieb-Preset (Body-questions werden ignoriert)', async () => {
    const insertedQuestions: unknown[] = [];
    let jobUpdated = false;
    let configInserted: unknown = null;

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        for (const m of ['eq', 'order', 'neq', 'filter', 'in']) {
          chain[m] = self;
        }
        chain['select'] = self;
        chain['single'] = () => {
          if (table === 'jobs') return Promise.resolve({ data: { id: JOB_ID, bot_config_id: null }, error: null });
          if (table === 'bot_configs') return Promise.resolve({ data: { id: CONFIG_ID, agency_id: AGENCY_ID }, error: null });
          return Promise.resolve({ data: null, error: null });
        };
        chain['maybeSingle'] = () => Promise.resolve({ data: null, error: null });
        chain['insert'] = (data: unknown) => {
          if (table === 'bot_configs') configInserted = data;
          if (table === 'bot_questions') {
            if (Array.isArray(data)) insertedQuestions.push(...data);
            else insertedQuestions.push(data);
          }
          return { select: () => ({ single: () => Promise.resolve({ data: { id: CONFIG_ID }, error: null }) }) };
        };
        chain['update'] = () => {
          if (table === 'jobs') jobUpdated = true;
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        };
        chain['delete'] = () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) });
        chain['then'] = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return chain;
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(
      makePutRequest({
        preset_key: 'vertrieb',
        config: validConfig,
        questions: [{ key: 'body_question', text: 'Wird ignoriert', type: 'text', required: false, weight: 1 }],
      }),
      { params: makeParams() }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(typeof json.config_id).toBe('string');

    // Preset-Fragen statt Body-Fragen
    const insertedKeys = insertedQuestions.map((q: unknown) => (q as Record<string, string>).key);
    expect(insertedKeys).toContain('fuehrerschein');
    expect(insertedKeys).toContain('erfahrung_jahre');
    expect(insertedKeys).toContain('starttermin');
    expect(insertedKeys).toContain('arbeitszeit');
    expect(insertedKeys).toContain('letzte_taetigkeit');
    expect(insertedKeys).not.toContain('body_question');
  });

  // --- Neuen Config anlegen + jobs.bot_config_id aktualisieren ---

  it('P15: legt neuen Config an und verknüpft ihn mit jobs.bot_config_id (agency-scoped)', async () => {
    let jobsUpdated = false;
    let jobsUpdatePayload: unknown = null;

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        for (const m of ['eq', 'order', 'neq', 'filter', 'in', 'select']) {
          chain[m] = self;
        }
        chain['single'] = () => {
          if (table === 'jobs') return Promise.resolve({ data: { id: JOB_ID, bot_config_id: null }, error: null });
          if (table === 'bot_configs') return Promise.resolve({ data: { id: CONFIG_ID }, error: null });
          return Promise.resolve({ data: null, error: null });
        };
        chain['insert'] = () => ({
          select: () => ({ single: () => Promise.resolve({ data: { id: CONFIG_ID }, error: null }) }),
        });
        chain['update'] = (payload: unknown) => {
          if (table === 'jobs') {
            jobsUpdated = true;
            jobsUpdatePayload = payload;
          }
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        };
        chain['delete'] = () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) });
        chain['then'] = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return chain;
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(
      makePutRequest({ config: validConfig, questions: validQuestions }),
      { params: makeParams() }
    );

    expect(res.status).toBe(200);
    expect(jobsUpdated).toBe(true);
    expect((jobsUpdatePayload as Record<string, unknown>).bot_config_id).toBe(CONFIG_ID);
  });

  // --- Fragen vollständig ersetzen (DELETE + INSERT) ---

  it('P16: ersetzt Fragen vollständig — setzt position als Array-Index', async () => {
    const insertedQuestions: unknown[] = [];
    let deleteCalled = false;

    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        for (const m of ['eq', 'order', 'neq', 'filter', 'in', 'select']) {
          chain[m] = self;
        }
        chain['single'] = () => {
          if (table === 'jobs') return Promise.resolve({ data: { id: JOB_ID, bot_config_id: CONFIG_ID }, error: null });
          if (table === 'bot_configs') return Promise.resolve({ data: { id: CONFIG_ID, agency_id: AGENCY_ID }, error: null });
          return Promise.resolve({ data: null, error: null });
        };
        chain['insert'] = (data: unknown) => {
          if (table === 'bot_questions') {
            if (Array.isArray(data)) insertedQuestions.push(...data);
          }
          return { select: () => ({ single: () => Promise.resolve({ data: { id: CONFIG_ID }, error: null }) }) };
        };
        chain['update'] = () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) });
        chain['delete'] = () => {
          if (table === 'bot_questions') deleteCalled = true;
          return { eq: () => ({ eq: () => Promise.resolve({ error: null }) }) };
        };
        chain['then'] = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return chain;
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const threeQuestions = [
      { key: 'q1', text: 'Frage 1', type: 'text',   required: true,  weight: 1 },
      { key: 'q2', text: 'Frage 2', type: 'number', required: false, weight: 2 },
      { key: 'q3', text: 'Frage 3', type: 'yes_no', required: true,  weight: 3 },
    ];

    const res = await PUT(
      makePutRequest({ config: validConfig, questions: threeQuestions }),
      { params: makeParams() }
    );

    expect(res.status).toBe(200);
    expect(deleteCalled).toBe(true);
    expect(insertedQuestions).toHaveLength(3);

    // position = Array-Index
    const positions = (insertedQuestions as Array<Record<string, unknown>>).map(q => q.position);
    expect(positions).toContain(0);
    expect(positions).toContain(1);
    expect(positions).toContain(2);
  });

  // --- Erfolgsfall: gibt { ok: true, config_id } zurück ---

  it('P17: gibt { ok: true, config_id } zurück bei erfolgreichem PUT', async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        const self = () => chain;
        for (const m of ['eq', 'order', 'neq', 'filter', 'in', 'select']) {
          chain[m] = self;
        }
        chain['single'] = () => {
          if (table === 'jobs') return Promise.resolve({ data: { id: JOB_ID, bot_config_id: null }, error: null });
          if (table === 'bot_configs') return Promise.resolve({ data: { id: CONFIG_ID }, error: null });
          return Promise.resolve({ data: null, error: null });
        };
        chain['insert'] = () => ({
          select: () => ({ single: () => Promise.resolve({ data: { id: CONFIG_ID }, error: null }) }),
        });
        chain['update'] = () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) });
        chain['delete'] = () => ({ eq: () => ({ eq: () => Promise.resolve({ error: null }) }) });
        chain['then'] = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return chain;
      },
    } as unknown as ReturnType<typeof createAdminClient>);

    const res = await PUT(
      makePutRequest({ config: validConfig, questions: validQuestions }),
      { params: makeParams() }
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.config_id).toBe(CONFIG_ID);
  });
});
