import { describe, it, expect, vi, afterEach } from 'vitest';
import { createFakeDb } from './fake-db';
import { auswerten, spieleTestleadDurch } from '../testlead';

const AG = 'agency-1';
afterEach(() => vi.unstubAllGlobals());

function db(extra: Record<string, Record<string, unknown>[]> = {}) {
  return createFakeDb({
    agencies: [{ id: AG, bausteine: ['indeed'] }],
    pipeline_stages: [{ id: 's1', agency_id: null }],
    client_steps: [{ id: 'st', agency_id: AG, step_key: 's_testlead', phase: 'setup', wer: 'zoepp', status: 'offen' }],
    ...extra,
  });
}

describe('Test-Lead', () => {
  it('Warnungen sind ok, Fehler nicht', () => {
    expect(auswerten([{ key: 'a', label: 'A', status: 'warnung', hinweis: '' }])).toBe(true);
    expect(auswerten([{ key: 'a', label: 'A', status: 'fehler', hinweis: '' }])).toBe(false);
    expect(auswerten([])).toBe(false);
  });

  it('Webhook ok → Bewerber geprüft, danach anonymisiert entfernt, Schritt abgehakt', async () => {
    const { client, tables } = db({ candidates: [{ id: 'c1', agency_id: AG, current_stage_id: 's1', email: 'x@y.de', phone: '+49170' }] });
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, candidate_id: 'c1' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const e = await spieleTestleadDurch(client, AG, { origin: 'https://cloud.test', tester: { name: 'Nils', phone: null }, userId: 'u1' });

    expect(fetchMock).toHaveBeenCalledWith('https://cloud.test/api/webhooks/perspective?agency=agency-1', expect.objectContaining({ method: 'POST' }));
    expect(e.punkte.map((p) => [p.key, p.status])).toEqual([
      ['pipeline', 'ok'],
      ['webhook', 'ok'],
      ['cloud', 'ok'],
      ['whatsapp', 'warnung'],
      ['indeed', 'warnung'],
    ]);
    expect(e.bestanden).toBe(true);
    expect(e.schrittAbgehakt).toBe(true);
    expect(tables.client_steps[0].status).toBe('erledigt');
    expect(tables.candidates[0]).toMatchObject({ email: null, phone: null });
    expect(tables.candidates[0].deleted_at).toBeTruthy();
  });

  it('Webhook-Fehler → nicht bestanden, Schritt bleibt offen', async () => {
    const { client, tables } = db();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'Agentur nicht gefunden' }), { status: 404 })));
    const e = await spieleTestleadDurch(client, AG, { origin: 'https://cloud.test', tester: { name: 'Nils', phone: null }, userId: 'u1' });
    expect(e.bestanden).toBe(false);
    expect(e.punkte.find((p) => p.key === 'webhook')).toMatchObject({ status: 'fehler' });
    expect(tables.client_steps[0].status).toBe('offen');
  });
});
