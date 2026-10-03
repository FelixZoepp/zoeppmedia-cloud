/**
 * Minimaler In-Memory-Ersatz für den Supabase-Client — genug für die Fulfillment-Logik:
 * select/eq/neq/in/not(in)/is/order/limit/maybeSingle/single, insert/update/upsert (onConflict, ignoreDuplicates).
 */

type Row = Record<string, unknown>;
type Filter = (r: Row) => boolean;

let idCounter = 0;
const newId = () => `id-${++idCounter}`;

export function createFakeDb(initial: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = {};
  for (const [k, v] of Object.entries(initial)) tables[k] = v.map((r) => ({ ...r }));
  const t = (name: string) => (tables[name] ??= []);

  function query(table: string) {
    const filters: Filter[] = [];
    let mode: 'select' | 'update' | 'insert' | 'upsert' | 'delete' = 'select';
    let payload: Row | Row[] | null = null;
    let upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean } = {};
    let order: { col: string; asc: boolean } | null = null;
    let limit: number | null = null;

    const run = (): { data: unknown; error: null } => {
      const rows = t(table);
      if (mode === 'insert' || mode === 'upsert') {
        const list = (Array.isArray(payload) ? payload : [payload]) as Row[];
        const inserted: Row[] = [];
        for (const r of list) {
          if (mode === 'upsert' && upsertOpts.onConflict) {
            const cols = upsertOpts.onConflict.split(',');
            const existing = rows.find((x) => cols.every((c) => x[c] === r[c]));
            if (existing) {
              if (!upsertOpts.ignoreDuplicates) Object.assign(existing, r);
              continue;
            }
          }
          const row = { id: newId(), created_at: new Date().toISOString(), ...r };
          rows.push(row);
          inserted.push(row);
        }
        return { data: inserted, error: null };
      }
      let matched = rows.filter((r) => filters.every((f) => f(r)));
      if (mode === 'update') {
        matched.forEach((r) => Object.assign(r, payload));
        return { data: matched, error: null };
      }
      if (mode === 'delete') {
        tables[table] = rows.filter((r) => !matched.includes(r));
        return { data: matched, error: null };
      }
      if (order) {
        const { col, asc } = order;
        matched = [...matched].sort((a, b) => (String(a[col]) < String(b[col]) ? -1 : 1) * (asc ? 1 : -1));
      }
      if (limit !== null) matched = matched.slice(0, limit);
      return { data: matched.map((r) => ({ ...r })), error: null };
    };

    const chain = {
      select: () => chain,
      eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), chain),
      neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), chain),
      in: (c: string, v: unknown[]) => (filters.push((r) => v.includes(r[c])), chain),
      is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), chain),
      gte: (c: string, v: string) => (filters.push((r) => String(r[c]) >= v), chain),
      lte: (c: string, v: string) => (filters.push((r) => String(r[c]) <= v), chain),
      lt: (c: string, v: string) => (filters.push((r) => String(r[c]) < v), chain),
      not: (c: string, op: string, v: unknown) => {
        if (op === 'in') {
          const list = String(v).replace(/[()]/g, '').split(',');
          filters.push((r) => !list.includes(String(r[c])));
        } else if (op === 'is') {
          filters.push((r) => (r[c] ?? null) !== v);
        }
        return chain;
      },
      order: (col: string, o?: { ascending?: boolean }) => ((order = { col, asc: o?.ascending !== false }), chain),
      limit: (n: number) => ((limit = n), chain),
      insert: (p: Row | Row[]) => ((mode = 'insert'), (payload = p), chain),
      upsert: (p: Row | Row[], o?: { onConflict?: string; ignoreDuplicates?: boolean }) => (
        (mode = 'upsert'), (payload = p), (upsertOpts = o ?? {}), chain
      ),
      update: (p: Row) => ((mode = 'update'), (payload = p), chain),
      delete: () => ((mode = 'delete'), chain),
      maybeSingle: async () => {
        const { data } = run();
        return { data: (data as Row[])[0] ?? null, error: null };
      },
      single: async () => {
        const { data } = run();
        return { data: (data as Row[])[0] ?? null, error: null };
      },
      then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) => {
        try {
          resolve(run());
        } catch (e) {
          reject?.(e);
        }
      },
    };
    return chain;
  }

  return {
    tables,
    client: { from: (table: string) => query(table) } as never,
  };
}
