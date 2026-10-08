import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));

import { runCadence, runCadenceIfDue, KADENZ_LAUF_KEY, naechstesFenster } from '../run';
import type { SupabaseClient } from '@supabase/supabase-js';

type Row = Record<string, unknown>;

/** Minimaler In-Memory-Ersatz für die genutzten Supabase-Aufrufe */
function fakeDb(tables: Record<string, Row[]>) {
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Row = {};
    let insertRows: Row[] = [];
    let limit = Infinity;
    let single = false;
    let returning = false;
    const b = {
      select() { if (op !== 'select') returning = true; return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return b; },
      not(c: string, _o: string, v: unknown) { filters.push((r) => r[c] !== v && !(v === null && r[c] == null)); return b; },
      lte(c: string, v: string) { filters.push((r) => String(r[c]) <= v); return b; },
      order() { return b; },
      limit(n: number) { limit = n; return b; },
      maybeSingle() { single = true; return b; },
      update(p: Row) { op = 'update'; patch = p; return b; },
      insert(p: Row | Row[]) { op = 'insert'; insertRows = Array.isArray(p) ? p : [p]; return b; },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(res, rej);
      },
    };
    const run = () => {
      if (op === 'insert') {
        if (table === 'system_einstellungen' && insertRows.some((n) => rows.some((r) => r.key === n.key))) {
          return { data: null, error: { code: '23505', message: 'duplicate' } };
        }
        rows.push(...insertRows);
        return { data: insertRows, error: null };
      }
      const hits = rows.filter((r) => filters.every((f) => f(r))).slice(0, limit);
      if (op === 'update') {
        hits.forEach((r) => Object.assign(r, patch));
        return { data: returning ? hits : null, error: null };
      }
      return { data: single ? hits[0] ?? null : hits, error: null };
    };
    return b;
  };
  return { from } as unknown as SupabaseClient;
}

const NOW = new Date('2026-10-09T08:00:00Z'); // 10:00 Berlin

function cand(id: string, nextAt: string, extra: Row = {}): Row {
  return { id, name: `K ${id}`, agency_id: 'a1', cadence_active: true, cadence_attempt: 1, cadence_next_window: 'morning', cadence_next_at: nextAt, ...extra };
}

describe('runCadence', () => {
  let tables: Record<string, Row[]>;
  beforeEach(() => {
    tables = { candidates: [], internal_tasks: [], users: [{ id: 'u1', role: 'admin' }], system_einstellungen: [] };
  });

  it('legt pro fälligem Kandidaten genau eine Aufgabe an, auch bei zwei Läufen hintereinander', async () => {
    tables.candidates.push(cand('c1', '2026-10-09T07:50:00Z'));
    const db = fakeDb(tables);
    await runCadence(db, NOW);
    await runCadence(db, NOW);
    expect(tables.internal_tasks).toHaveLength(1);
    expect(tables.candidates[0].cadence_next_at).toBeNull();
  });

  it('überspringt Kandidaten, die ein paralleler Lauf schon beansprucht hat', async () => {
    tables.candidates.push(cand('c1', '2026-10-09T07:50:00Z'));
    const db = fakeDb(tables);
    // paralleler Lauf hat cadence_next_at inzwischen geleert → bedingtes Update trifft nichts
    const origFrom = (db as unknown as { from: (t: string) => unknown }).from;
    let gelesen = false;
    (db as unknown as { from: (t: string) => unknown }).from = (t: string) => {
      const q = origFrom(t) as { then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => unknown };
      if (t === 'candidates' && !gelesen) {
        gelesen = true;
        const origThen = q.then.bind(q);
        q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
          origThen((v: unknown) => {
            tables.candidates[0].cadence_next_at = null;
            return res(v);
          }, rej);
      }
      return q;
    };
    const r = await runCadence(db, NOW);
    expect(r.tasksCreated).toBe(0);
    expect(tables.internal_tasks).toHaveLength(0);
  });

  it('holt verpasste Zeitfenster nicht nach, sondern verschiebt aufs nächste gleiche Fenster', async () => {
    tables.candidates.push(cand('c1', '2026-10-08T07:00:00Z', { cadence_next_window: 'morning' }));
    const r = await runCadence(fakeDb(tables), NOW);
    expect(r.tasksCreated).toBe(0);
    expect(r.verschoben).toBe(1);
    const neu = new Date(String(tables.candidates[0].cadence_next_at));
    expect(neu.getTime()).toBeGreaterThan(NOW.getTime());
  });
});

describe('naechstesFenster', () => {
  it('liefert heute, wenn das Fenster noch kommt, sonst morgen', () => {
    expect(naechstesFenster(NOW, 'afternoon').toISOString()).toBe('2026-10-09T12:00:00.000Z');
    expect(naechstesFenster(NOW, 'morning').toISOString()).toBe('2026-10-10T07:00:00.000Z');
  });
});

describe('runCadenceIfDue', () => {
  it('läuft höchstens alle 15 Minuten', async () => {
    const tables: Record<string, Row[]> = { candidates: [], internal_tasks: [], users: [], system_einstellungen: [], agencies: [{ id: 'a1', automatik: true }] };
    const db = fakeDb(tables);
    expect((await runCadenceIfDue(db, NOW)).skipped).toBe(false);
    expect((await runCadenceIfDue(db, new Date(NOW.getTime() + 5 * 60_000))).skipped).toBe(true);
    expect((await runCadenceIfDue(db, new Date(NOW.getTime() + 16 * 60_000))).skipped).toBe(false);
    expect(tables.system_einstellungen.find((r) => r.key === KADENZ_LAUF_KEY)?.wert).toBe(new Date(NOW.getTime() + 16 * 60_000).toISOString());
  });

  it('bedient nur Kandidaten von Automatik-Kunden – Bestandskunden bleiben beim täglichen Cron', async () => {
    const tables: Record<string, Row[]> = {
      candidates: [cand('neu', '2026-10-09T07:50:00Z', { agency_id: 'a-neu' }), cand('alt', '2026-10-09T07:50:00Z', { agency_id: 'a-alt' })],
      internal_tasks: [],
      users: [{ id: 'u1', role: 'admin' }],
      system_einstellungen: [],
      agencies: [{ id: 'a-neu', automatik: true }, { id: 'a-alt', automatik: false }],
    };
    await runCadenceIfDue(fakeDb(tables), NOW);
    expect(tables.internal_tasks).toHaveLength(1);
    expect(tables.internal_tasks[0].agency_id).toBe('a-neu');
    expect(tables.candidates.find((c) => c.id === 'alt')!.cadence_next_at).toBe('2026-10-09T07:50:00Z');
  });

  it('ohne Automatik-Kunden passiert nichts (Drosselung bleibt unberührt)', async () => {
    const tables: Record<string, Row[]> = { candidates: [cand('alt', '2026-10-09T07:50:00Z')], internal_tasks: [], users: [], system_einstellungen: [], agencies: [{ id: 'a1', automatik: false }] };
    expect((await runCadenceIfDue(fakeDb(tables), NOW)).skipped).toBe(true);
    expect(tables.internal_tasks).toHaveLength(0);
    expect(tables.system_einstellungen).toHaveLength(0);
  });
});
