import { describe, expect, it } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { stundenProKunde, tabelleFehlt } from '../server';

/** Minimaler Supabase-Ersatz: jede Kette endet in { data, error } */
function fakeSvc(tabellen: Record<string, { data: unknown; error: unknown }>): SupabaseClient {
  const kette = (ergebnis: { data: unknown; error: unknown }) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'gte', 'lt', 'order', 'range', 'is']) q[m] = () => q;
    q.maybeSingle = () => Promise.resolve(ergebnis);
    q.then = (ok: (v: unknown) => unknown, f?: (e: unknown) => unknown) => Promise.resolve(ergebnis).then(ok, f);
    return q;
  };
  return { from: (t: string) => kette(tabellen[t] ?? { data: null, error: null }) } as unknown as SupabaseClient;
}

describe('stundenProKunde', () => {
  it('fehlende Tabelle → leeres Ergebnis statt Fehler', async () => {
    const svc = fakeSvc({ zeiteintraege: { data: null, error: { code: 'PGRST205', message: "Could not find the table 'public.zeiteintraege' in the schema cache" } } });
    await expect(stundenProKunde(svc, '2026-10')).resolves.toEqual([]);
  });

  it('summiert je Kunde mit Stundensatz aus den Einstellungen', async () => {
    const svc = fakeSvc({
      system_einstellungen: { data: { wert: '40' }, error: null },
      zeiteintraege: {
        data: [
          { id: '1', user_id: 'u', agency_id: 'a', taetigkeit: 'support', start: '2026-10-01T08:00:00Z', ende: '2026-10-01T09:30:00Z', minuten: 90, notiz: null },
          { id: '2', user_id: 'u', agency_id: null, taetigkeit: 'intern', start: '2026-10-02T08:00:00Z', ende: '2026-10-02T08:30:00Z', minuten: 30, notiz: null },
          { id: '3', user_id: 'u', agency_id: 'a', taetigkeit: 'support', start: '2026-10-03T08:00:00Z', ende: null, minuten: null, notiz: null },
        ],
        error: null,
      },
    });
    await expect(stundenProKunde(svc, '2026-10')).resolves.toEqual([
      { agencyId: 'a', minuten: 90, kosten: 60 },
      { agencyId: null, minuten: 30, kosten: 20 },
    ]);
  });

  it('erkennt fehlende Tabelle an Code oder Meldung', () => {
    expect(tabelleFehlt({ code: '42P01' })).toBe(true);
    expect(tabelleFehlt({ message: 'relation "zeiteintraege" does not exist' })).toBe(true);
    expect(tabelleFehlt({ code: '23505', message: 'duplicate key' })).toBe(false);
    expect(tabelleFehlt(null)).toBe(false);
  });
});
