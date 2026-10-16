import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ladeBuchungsModus } from '../vorstellungsrunden';

type Antwort = { data: unknown; error: { code?: string; message?: string } | null };

/** Minimaler Supabase-Fake: Antwort je Tabelle, abhängig von den gewählten Spalten */
function fakeSvc(antworten: (tabelle: string, spalten: string) => Antwort): SupabaseClient {
  return {
    from(tabelle: string) {
      let spalten = '';
      const q: Record<string, unknown> = {};
      const ergebnis = () => antworten(tabelle, spalten);
      for (const m of ['eq', 'in', 'gte', 'order', 'limit', 'not']) q[m] = () => q;
      q.select = (s: string) => { spalten = s; return q; };
      q.maybeSingle = async () => ergebnis();
      q.single = async () => ergebnis();
      q.then = (res: (v: Antwort) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(ergebnis()).then(res, rej);
      return q;
    },
  } as unknown as SupabaseClient;
}

const APPT = { id: 'appt-1', agency_id: 'ag-1', application_id: 'app-1' };
const morgen = (stunden: number) => new Date(Date.now() + stunden * 3600_000).toISOString();

describe('ladeBuchungsModus', () => {
  it('ohne Migration: Einzelslots wie bisher', async () => {
    const svc = fakeSvc((t, s) => {
      if (t === 'applications') return { data: { job_id: 'job-1' }, error: null };
      if (t === 'jobs' && s.includes('termin_format')) return { data: null, error: { code: '42703', message: 'column jobs.termin_format does not exist' } };
      if (t === 'jobs') return { data: { appointment_type: 'onsite', appointment_location: 'Hauptstraße 5' }, error: null };
      return { data: null, error: null };
    });
    expect(await ladeBuchungsModus(svc, APPT)).toEqual({ modus: 'einzel', format: 'vor_ort', ort: 'Hauptstraße 5' });
  });

  it('Vorstellungsrunde: nur Runden mit freiem Platz, eigene Runde beim Verschieben nicht', async () => {
    const svc = fakeSvc((t) => {
      if (t === 'applications') return { data: { job_id: 'job-1' }, error: null };
      if (t === 'jobs') return { data: { appointment_type: 'onsite', appointment_location: null, termin_format: 'vorstellungsrunde' }, error: null };
      if (t === 'agencies') return { data: { anschrift: 'Hauptstraße 5' }, error: null };
      if (t === 'vorstellungsrunden') {
        return {
          data: [
            { id: 'r-voll', starts_at: morgen(24), ends_at: morgen(25), adresse: 'Hauptstraße 5', hinweis: null, max_teilnehmer: 1 },
            { id: 'r-eigene', starts_at: morgen(48), ends_at: morgen(49), adresse: 'Hauptstraße 5', hinweis: null, max_teilnehmer: 5 },
            { id: 'r-frei', starts_at: morgen(72), ends_at: morgen(73), adresse: 'Hauptstraße 5', hinweis: '2. OG', max_teilnehmer: 5 },
          ],
          error: null,
        };
      }
      if (t === 'appointments') {
        return {
          data: [
            { id: 'x', application_id: 'app-x', status: 'booked', vorstellungsrunde_id: 'r-voll' },
            { id: 'appt-1', application_id: 'app-1', status: 'confirmed', vorstellungsrunde_id: 'r-eigene' },
          ],
          error: null,
        };
      }
      return { data: null, error: null };
    });
    const modus = await ladeBuchungsModus(svc, APPT);
    expect(modus.modus).toBe('vorstellungsrunde');
    if (modus.modus !== 'vorstellungsrunde') return;
    expect(modus.runden.map((r) => [r.id, r.freie_plaetze])).toEqual([['r-frei', 5]]);
  });

  it('Tabelle fehlt trotz Format: Einzelslots', async () => {
    const svc = fakeSvc((t) => {
      if (t === 'applications') return { data: { job_id: 'job-1' }, error: null };
      if (t === 'jobs') return { data: { appointment_type: 'onsite', termin_format: 'vorstellungsrunde' }, error: null };
      if (t === 'vorstellungsrunden') return { data: null, error: { code: 'PGRST205', message: 'Could not find the table' } };
      return { data: null, error: null };
    });
    expect((await ladeBuchungsModus(svc, APPT)).modus).toBe('einzel');
  });
});
