import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';

const setStepStatus = vi.fn(async () => ({ advancedTo: null }));
vi.mock('@/lib/fulfillment/engine', () => ({ setStepStatus: (...a: unknown[]) => setStepStatus(...(a as [])) }));
vi.mock('@/lib/notifications/create', () => ({ createNotificationForInternals: vi.fn(async () => undefined) }));

import { baueFunnelBisFertig, baueTextPrompt, ladeVorlage, starteFunnelBau, treibeFunnelBauVoran } from '../funnel-bau';
import type { PerspectiveMcp } from '../mcp-client';

const VORLAGE = 'a'.repeat(24);
const TEXTE = {
  headline: 'Verdiene 5.000 € im Vertrieb',
  subheadline: 'Quereinsteiger willkommen',
  vorteile: ['Fixum', 'Firmenwagen'],
  quiz: [{ frage: 'Erfahrung?', antworten: ['Ja', 'Nein'] }],
  formular_text: 'Jetzt bewerben',
  danke_text: 'Wir rufen dich an',
  perspective_prompt: 'egal',
};

function db(extra: Record<string, Array<Record<string, unknown>>> = {}) {
  return createFakeDb({
    agencies: [{ id: 'ag1', name: 'Muster GmbH' }],
    fulfillment_inhalte: [{ id: 'in1', agency_id: 'ag1', art: 'funnel', inhalt: TEXTE, created_at: '2026-10-08T10:00:00Z' }],
    onboarding_submissions: [{ agency_id: 'ag1', company_name: 'Muster GmbH', product: 'pv', created_at: '2026-10-01' }],
    system_einstellungen: [{ key: 'perspective_vorlage_funnel_id', wert: VORLAGE }],
    client_steps: [{ id: 'st1', agency_id: 'ag1', step_key: 's_funnel', status: 'offen' }],
    ...extra,
  });
}

function fakeMcp(antworten: Record<string, Array<Record<string, unknown>>>) {
  const tool = vi.fn(async (name: string, _args?: Record<string, unknown>) => {
    void _args;
    const liste = antworten[name];
    if (!liste?.length) throw new Error(`unerwarteter Aufruf ${name}`);
    return liste.length > 1 ? liste.shift()! : liste[0];
  });
  return { mcp: { tool } as unknown as PerspectiveMcp, tool };
}

beforeEach(() => setStepStatus.mockClear());

describe('ladeVorlage', () => {
  it('bevorzugt Produkt-Vorlage und ignoriert ungültige IDs', async () => {
    const { client } = db({ system_einstellungen: [
      { key: 'perspective_vorlage_funnel_id', wert: VORLAGE },
      { key: 'perspective_vorlage_funnel_id:pv', wert: 'b'.repeat(24) },
      { key: 'perspective_vorlage_funnel_id:gas', wert: 'kaputt' },
    ] });
    expect(await ladeVorlage(client, 'pv')).toBe('b'.repeat(24));
    expect(await ladeVorlage(client, 'gas')).toBe(VORLAGE);
  });
});

describe('baueTextPrompt', () => {
  it('enthält alle Texte und die Anweisung, Formular/Integrationen zu behalten', () => {
    const p = baueTextPrompt(TEXTE, 'Muster GmbH');
    for (const t of [TEXTE.headline, TEXTE.subheadline, 'Fixum', 'Erfahrung?', 'Ja | Nein', TEXTE.danke_text, 'Muster GmbH']) expect(p).toContain(t);
    expect(p).toMatch(/Integrationen bleiben unverändert/);
  });
});

describe('starteFunnelBau', () => {
  it('ohne Texte oder Vorlage: klare Meldung, kein Datensatz', async () => {
    const { mcp } = fakeMcp({});
    const a = db({ fulfillment_inhalte: [] });
    expect(await starteFunnelBau(a.client, 'ag1', { mcp })).toMatchObject({ ok: false, grund: 'keine_texte' });
    const b = db({ system_einstellungen: [] });
    expect(await starteFunnelBau(b.client, 'ag1', { mcp })).toMatchObject({ ok: false, grund: 'keine_vorlage' });
    expect(b.tables.perspective_funnels ?? []).toHaveLength(0);
  });

  it('ohne API-Key und ohne Client: nicht konfiguriert', async () => {
    const alt = process.env.PERSPECTIVE_API_KEY;
    delete process.env.PERSPECTIVE_API_KEY;
    expect(await starteFunnelBau(db().client, 'ag1')).toMatchObject({ ok: false, grund: 'nicht_konfiguriert' });
    if (alt) process.env.PERSPECTIVE_API_KEY = alt;
  });

  it('ist idempotent: zweiter Start liefert den laufenden Bau', async () => {
    const { mcp } = fakeMcp({});
    const d = db();
    const eins = await starteFunnelBau(d.client, 'ag1', { mcp });
    const zwei = await starteFunnelBau(d.client, 'ag1', { mcp });
    expect(eins).toMatchObject({ ok: true, neu: true });
    expect(zwei).toMatchObject({ ok: true, neu: false });
    expect(d.tables.perspective_funnels).toHaveLength(1);
    expect(d.tables.perspective_funnels[0]).toMatchObject({ bau_status: 'gestartet', vorlage_funnel_id: VORLAGE, inhalt_id: 'in1' });
  });
});

describe('treibeFunnelBauVoran / baueFunnelBisFertig', () => {
  it('kompletter Durchlauf: duplizieren → Texte → fertig → veröffentlichen → Schritt + Aufgabe', async () => {
    const d = db();
    const { mcp, tool } = fakeMcp({
      duplicate_funnel: [{ data: { id: 'f'.repeat(24), editorUrl: 'https://editor/f' } }],
      update_funnel: [{ data: { jobId: 'job1', funnelId: 'f'.repeat(24) } }],
      get_funnel_job_status: [{ status: 'in_progress' }, { status: 'completed' }],
      publish_funnel: [{ data: { liveUrl: 'https://live.perspective/f' } }],
    });
    const start = await starteFunnelBau(d.client, 'ag1', { mcp });
    if (!start.ok) throw new Error('Start fehlgeschlagen');
    const ende = await baueFunnelBisFertig(d.client, start.funnel.id, { mcp });

    expect(ende).toMatchObject({ bau_status: 'veroeffentlicht', url: 'https://live.perspective/f', perspective_funnel_id: 'f'.repeat(24) });
    expect(d.tables.perspective_funnels[0].status).toBe('published');
    expect(tool.mock.calls.map((c) => c[0])).toEqual(['duplicate_funnel', 'update_funnel', 'get_funnel_job_status', 'get_funnel_job_status', 'publish_funnel']);
    expect(tool.mock.calls[0][1]).toEqual({ funnelId: VORLAGE, data: { name: 'Muster GmbH Recruiting Funnel' } });
    expect(setStepStatus).toHaveBeenCalledWith(d.client, 'st1', 'erledigt', expect.anything());
    expect(d.tables.internal_tasks).toHaveLength(1);
    expect(String(d.tables.internal_tasks[0].description)).toMatch(/OHNE \?agency=/);
  });

  it('ohne Auto-Veröffentlichen bleibt der Bau bei texte_fertig stehen', async () => {
    const d = db();
    const { mcp, tool } = fakeMcp({
      duplicate_funnel: [{ data: { id: 'f'.repeat(24) } }],
      update_funnel: [{ data: { jobId: 'job1' } }],
      get_funnel_job_status: [{ status: 'completed' }],
    });
    const start = await starteFunnelBau(d.client, 'ag1', { mcp, autoVeroeffentlichen: false });
    if (!start.ok) throw new Error();
    const ende = await baueFunnelBisFertig(d.client, start.funnel.id, { mcp });
    expect(ende?.bau_status).toBe('texte_fertig');
    expect(tool.mock.calls.map((c) => c[0])).not.toContain('publish_funnel');
    expect(setStepStatus).not.toHaveBeenCalled();
  });

  it('Fehler von Perspective landen als bau_status=fehler statt zu werfen', async () => {
    const d = db();
    const tool = vi.fn(async () => { throw new Error('Funnel not found'); });
    const mcp = { tool } as unknown as PerspectiveMcp;
    const start = await starteFunnelBau(d.client, 'ag1', { mcp });
    if (!start.ok) throw new Error();
    const stand = await treibeFunnelBauVoran(d.client, start.funnel.id, { mcp });
    expect(stand).toMatchObject({ bau_status: 'fehler', bau_fehler: 'Funnel not found' });
  });

  it('gescheiterter KI-Job wird als Fehler gemeldet', async () => {
    const d = db();
    const { mcp } = fakeMcp({
      duplicate_funnel: [{ data: { id: 'f'.repeat(24) } }],
      update_funnel: [{ data: { jobId: 'job1' } }],
      get_funnel_job_status: [{ status: 'failed', error: 'Generation timed out' }],
    });
    const start = await starteFunnelBau(d.client, 'ag1', { mcp });
    if (!start.ok) throw new Error();
    const ende = await baueFunnelBisFertig(d.client, start.funnel.id, { mcp });
    expect(ende).toMatchObject({ bau_status: 'fehler', bau_fehler: 'Generation timed out' });
  });
});
