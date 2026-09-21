import { describe, it, expect, vi } from 'vitest';
import { fireAutomations, AutomationContext } from '../engine';

// ---------------------------------------------------------------------------
// Minimal Supabase-Mock-Fabrik
// ---------------------------------------------------------------------------

type EqCall = { column: string; value: unknown };

interface MockQueryBuilder {
  _table: string;
  _eqCalls: EqCall[];
  _insertData?: unknown;
  select: (cols?: string) => MockQueryBuilder;
  update: (data: unknown) => MockQueryBuilder;
  insert: (data: unknown) => MockQueryBuilder;
  upsert: (data: unknown, opts?: unknown) => MockQueryBuilder;
  eq: (col: string, val: unknown) => MockQueryBuilder;
  or: (filter: string) => MockQueryBuilder;
  then: (resolve: (v: { data: unknown; error: null }) => void) => Promise<void>;
}

function makeQueryBuilder(table: string, rows: unknown[]): MockQueryBuilder {
  const builder: MockQueryBuilder = {
    _table: table,
    _eqCalls: [],
    _insertData: undefined,
    select() { return this; },
    update() { return this; },
    insert(data) { this._insertData = data; return this; },
    upsert(data) { this._insertData = data; return this; },
    eq(col, val) { this._eqCalls.push({ column: col, value: val }); return this; },
    or() { return this; },
    then(resolve) { return Promise.resolve(resolve({ data: rows, error: null })); },
  };
  return builder;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('engine — Agency-Scoping (FB-M1)', () => {
  const AGENCY_ID = 'agency-abc';
  const CANDIDATE_ID = 'cand-123';
  const STAGE_ID = 'stage-xyz';

  const context: AutomationContext = {
    trigger_event: 'stage_changed',
    agency_id: AGENCY_ID,
    candidate_id: CANDIDATE_ID,
  };

  it('executeChangeStage scopet candidates-Update auf agency_id UND id', async () => {
    const candidatesBuilder = makeQueryBuilder('candidates', []);
    const candidateStagesBuilder = makeQueryBuilder('candidate_stages', []);
    const automationRunsBuilder = makeQueryBuilder('automation_runs', []);

    // Automation-Zeile: change_stage-Aktion
    const automationRow = {
      id: 'auto-1',
      agency_id: AGENCY_ID,
      name: 'Testautomat',
      trigger_event: 'stage_changed',
      conditions: [],
      actions: [{ type: 'change_stage', params: { stage_id: STAGE_ID } }],
      delay_seconds: 0,
      active: true,
      is_system: false,
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'automations') return makeQueryBuilder('automations', [automationRow]);
        if (table === 'candidates') return candidatesBuilder;
        if (table === 'candidate_stages') return candidateStagesBuilder;
        if (table === 'automation_runs') return automationRunsBuilder;
        return makeQueryBuilder(table, []);
      }),
    } as unknown as Parameters<typeof fireAutomations>[0];

    await fireAutomations(supabase, context);

    // candidates.update() muss sowohl id als auch agency_id tragen
    const idCall = candidatesBuilder._eqCalls.find((c) => c.column === 'id');
    const agencyCall = candidatesBuilder._eqCalls.find((c) => c.column === 'agency_id');

    expect(idCall, 'eq(id, candidate_id) fehlt').toBeDefined();
    expect(idCall?.value).toBe(CANDIDATE_ID);
    expect(agencyCall, 'eq(agency_id, agency_id) fehlt — FB-M1 Agency-Scoping verletzt!').toBeDefined();
    expect(agencyCall?.value).toBe(AGENCY_ID);
  });

  it('executeSetField scopet candidates-Update auf agency_id UND id', async () => {
    const candidatesBuilder = makeQueryBuilder('candidates', []);
    const automationRunsBuilder = makeQueryBuilder('automation_runs', []);

    const automationRow = {
      id: 'auto-2',
      agency_id: AGENCY_ID,
      name: 'Testautomat SetField',
      trigger_event: 'stage_changed',
      conditions: [],
      actions: [{ type: 'set_field', params: { table: 'candidates', field: 'notes', value: 'Testnotiz' } }],
      delay_seconds: 0,
      active: true,
      is_system: false,
    };

    const supabase = {
      from: vi.fn((table: string) => {
        if (table === 'automations') return makeQueryBuilder('automations', [automationRow]);
        if (table === 'candidates') return candidatesBuilder;
        if (table === 'automation_runs') return automationRunsBuilder;
        return makeQueryBuilder(table, []);
      }),
    } as unknown as Parameters<typeof fireAutomations>[0];

    await fireAutomations(supabase, context);

    const idCall = candidatesBuilder._eqCalls.find((c) => c.column === 'id');
    const agencyCall = candidatesBuilder._eqCalls.find((c) => c.column === 'agency_id');

    expect(idCall, 'eq(id, candidate_id) fehlt').toBeDefined();
    expect(idCall?.value).toBe(CANDIDATE_ID);
    expect(agencyCall, 'eq(agency_id, agency_id) fehlt — FB-M1 Agency-Scoping verletzt!').toBeDefined();
    expect(agencyCall?.value).toBe(AGENCY_ID);
  });
});
