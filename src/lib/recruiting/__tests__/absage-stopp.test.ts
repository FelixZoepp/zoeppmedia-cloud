import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/cadence/engine', () => ({ stopCadence: vi.fn(async () => undefined) }));

import { stopCadence } from '@/lib/cadence/engine';
import { anrufSperrgrund, endphase, ladeEndphasen, stoppeAbgesagtenBewerber } from '../absage-stopp';

type Row = Record<string, unknown>;

const C = '11111111-1111-4111-8111-111111111111';
const CONV = '22222222-2222-4222-8222-222222222222';
const APP = '33333333-3333-4333-8333-333333333333';
const TERMIN = '44444444-4444-4444-8444-444444444444';
const EINL = '66666666-6666-4666-8666-666666666666';
const FREMD = '99999999-9999-4999-8999-999999999999';
const AG = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const JETZT = '2026-11-01T10:00:00.000Z';

/** Minimaler In-Memory-Ersatz für die genutzten Supabase-Aufrufe; zeichnet Schreibzugriffe auf */
function fakeDb(tables: Record<string, Row[]>) {
  const schreibt: Array<{ table: string; patch: Row; ids: unknown[] }> = [];
  const from = (table: string) => {
    const rows = (tables[table] ??= []);
    const filters: Array<(r: Row) => boolean> = [];
    let op: 'select' | 'update' = 'select';
    let patch: Row = {};
    let single = false;
    const b = {
      select() { return b; },
      eq(c: string, v: unknown) { filters.push((r) => r[c] === v); return b; },
      in(c: string, v: unknown[]) { filters.push((r) => v.includes(r[c])); return b; },
      gte(c: string, v: string) { filters.push((r) => String(r[c]) >= v); return b; },
      or() { return b; }, // Gegenprüfung passiert im Code (sollJobAbbrechen)
      limit() { return b; },
      maybeSingle() { single = true; return b; },
      update(p: Row) { op = 'update'; patch = p; return b; },
      then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
        return Promise.resolve(run()).then(res, rej);
      },
    };
    const run = () => {
      const hits = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'update') {
        hits.forEach((r) => Object.assign(r, patch));
        schreibt.push({ table, patch, ids: hits.map((h) => h.id) });
        return { data: null, error: null };
      }
      return { data: single ? hits[0] ?? null : hits, error: null };
    };
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, schreibt };
}

function tabellen(): Record<string, Row[]> {
  return {
    applications: [{ id: APP, candidate_id: C, agency_id: AG }],
    candidates: [{ id: C, agency_id: AG, cadence_active: true }],
    conversations: [
      { id: CONV, candidate_id: C, agency_id: AG, state: 'bot_active' },
    ],
    candidate_appointments: [
      { id: TERMIN, candidate_id: C, agency_id: AG, status: 'geplant', scheduled_at: '2026-11-05T09:00:00Z' },
      { id: 'alt', candidate_id: C, agency_id: AG, status: 'geplant', scheduled_at: '2026-10-01T09:00:00Z' },
    ],
    appointments: [
      { id: EINL, application_id: APP, agency_id: AG, status: 'booked', starts_at: '2026-11-03T09:00:00Z' },
      { id: 'vergangen', application_id: APP, agency_id: AG, status: 'booked', starts_at: '2026-10-20T09:00:00Z' },
    ],
    scheduled_jobs: [
      { id: 'j1', agency_id: AG, status: 'pending', type: 'bot.nudge', payload: { conversation_id: CONV } },
      { id: 'j2', agency_id: AG, status: 'pending', type: 'appointment.reminder_24h', payload: { appointment_id: EINL } },
      { id: 'j3', agency_id: AG, status: 'pending', type: 'bot.nudge', payload: { conversation_id: FREMD } },
      { id: 'j4', agency_id: AG, status: 'pending', type: 'whatsapp.status', payload: { candidate_id: C } },
    ],
  };
}

describe('stoppeAbgesagtenBewerber', () => {
  beforeEach(() => vi.clearAllMocks());

  it('stoppt Anrufe, schließt Gespräche, bricht Jobs ab und sagt künftige Termine ab', async () => {
    const t = tabellen();
    const { db } = fakeDb(t);
    const r = await stoppeAbgesagtenBewerber(db, { candidateId: C, agencyId: AG, jetzt: JETZT });

    expect(stopCadence).toHaveBeenCalledWith(db, C, 'abgesagt');
    expect(t.conversations[0].state).toBe('closed');
    expect(t.scheduled_jobs.map((j) => [j.id, j.status])).toEqual([
      ['j1', 'cancelled'],
      ['j2', 'cancelled'],
      ['j3', 'pending'], // fremdes Gespräch
      ['j4', 'pending'], // Zustellstatus läuft weiter
    ]);
    expect(t.candidate_appointments.find((a) => a.id === TERMIN)?.status).toBe('abgesagt');
    expect(t.candidate_appointments.find((a) => a.id === 'alt')?.status).toBe('geplant');
    expect(t.appointments.find((a) => a.id === EINL)?.status).toBe('cancelled');
    expect(t.appointments.find((a) => a.id === 'vergangen')?.status).toBe('booked');

    expect(r.gestoppt).toEqual({ anrufe: true, gespraeche: 1, jobs: 2, termine: 2 });
    // Vorher-Zustand für Rückgängig
    expect(r.gespraeche).toEqual([{ id: CONV, state: 'bot_active' }]);
    expect(r.termine).toEqual([{ id: TERMIN, status: 'geplant' }]);
  });

  it('schreibt nichts nach außen: nur DB-Updates, keine Mail-/WhatsApp-Tabellen', async () => {
    const { db, schreibt } = fakeDb(tabellen());
    await stoppeAbgesagtenBewerber(db, { candidateId: C, agencyId: AG, jetzt: JETZT });
    const tabellenGeschrieben = [...new Set(schreibt.map((s) => s.table))].sort();
    expect(tabellenGeschrieben).toEqual(['appointments', 'candidate_appointments', 'conversations', 'scheduled_jobs']);
    // Jobs werden nur abgebrochen, nie neu angelegt oder fällig gestellt
    expect(schreibt.filter((s) => s.table === 'scheduled_jobs').every((s) => s.patch.status === 'cancelled')).toBe(true);
  });

  it('ohne aktive Kadenz kein stopCadence; übergebene Daten werden genutzt', async () => {
    const t = tabellen();
    t.applications = []; // würde nachgeladen leer sein – übergebene IDs zählen
    const { db } = fakeDb(t);
    const r = await stoppeAbgesagtenBewerber(db, { candidateId: C, agencyId: AG, applicationIds: [APP], cadenceActive: false, jetzt: JETZT });
    expect(stopCadence).not.toHaveBeenCalled();
    expect(r.gestoppt.anrufe).toBe(false);
    expect(t.appointments.find((a) => a.id === EINL)?.status).toBe('cancelled');
  });

  it('fasst nur Daten der eigenen Agentur an', async () => {
    const t = tabellen();
    t.conversations.push({ id: FREMD, candidate_id: C, agency_id: 'andere', state: 'bot_active' });
    const { db } = fakeDb(t);
    await stoppeAbgesagtenBewerber(db, { candidateId: C, agencyId: AG, jetzt: JETZT });
    expect(t.conversations.find((c) => c.id === FREMD)?.state).toBe('bot_active');
  });
});

describe('endphase / anrufSperrgrund / ladeEndphasen', () => {
  it('erkennt Absage und Einstellung über Typ und Namen', () => {
    expect(endphase({ stage_type: 'rejected', name: 'Raus' })).toBe('abgesagt');
    expect(endphase({ stage_type: null, name: 'Abgesagt (Kunde)' })).toBe('abgesagt');
    expect(endphase({ stage_type: 'hired', name: 'X' })).toBe('eingestellt');
    expect(endphase({ stage_type: null, name: 'Eingestellt' })).toBe('eingestellt');
    expect(endphase({ stage_type: 'new', name: 'Neu' })).toBeNull();
  });

  it('Sperrgrund: gelöscht vor Phase', () => {
    const m = new Map([['s1', 'abgesagt' as const]]);
    expect(anrufSperrgrund({ deleted_at: '2026-10-01', current_stage_id: null }, m)).toBe('geloescht');
    expect(anrufSperrgrund({ current_stage_id: 's1' }, m)).toBe('abgesagt');
    expect(anrufSperrgrund({ current_stage_id: 's2' }, m)).toBeNull();
    expect(anrufSperrgrund({}, m)).toBeNull();
  });

  it('lädt nur Abschluss-Phasen', async () => {
    const { db } = fakeDb({
      pipeline_stages: [
        { id: 's1', stage_type: 'rejected', name: 'Abgesagt' },
        { id: 's2', stage_type: 'hired', name: 'Eingestellt' },
        { id: 's3', stage_type: 'new', name: 'Neu' },
      ],
    });
    const m = await ladeEndphasen(db, ['s1', 's2', 's3', null, 's1']);
    expect([...m.entries()]).toEqual([
      ['s1', 'abgesagt'],
      ['s2', 'eingestellt'],
    ]);
  });
});
