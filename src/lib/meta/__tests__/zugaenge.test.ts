import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';
import { mockMetaFetch } from './meta-fetch';
import { pruefeUndUebernehme, metaZugaengeLauf } from '../zugaenge';

vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));

const AG = 'ag-1';

function schritt(step_key: string, extra: Record<string, unknown> = {}) {
  return { id: `s-${step_key}`, agency_id: AG, step_key, phase: 'onboarding', wer: 'kunde', status: 'offen', owner_user_id: null, kommentar: null, ...extra };
}

function db(agency: Record<string, unknown> = {}) {
  return createFakeDb({
    agencies: [{ id: AG, name: 'Test GmbH', meta_ad_account_id: 'act_123', meta_page_id: null, meta_instagram_id: null, meta_pixel_id: null, fulfillment_phase: 'onboarding', ...agency }],
    perspective_funnels: [{ id: 'f1', agency_id: AG, url: 'https://karriere.test-gmbh.de/start', status: 'published', updated_at: '2026-10-01' }],
    client_steps: ['o_meta_werbekonto', 'o_meta_zahlung', 'o_meta_seite', 'o_meta_instagram', 'o_meta_pixel', 'o_meta_domain'].map((k) => schritt(k)),
  });
}

const allesDa = {
  'GET /act_123': { account_status: 1, funding_source: 'fs1', funding_source_details: { id: 'fs1', display_string: 'Visa ****1234' }, business: { id: 'biz1' } },
  'GET /act_123/promote_pages': { data: [{ id: 'page1', name: 'Test GmbH' }] },
  'GET /page1': { name: 'Test GmbH', instagram_business_account: { id: 'ig1' } },
  'GET /act_123/adspixels': { data: [{ id: 'px1', name: 'Test Pixel' }] },
  'GET /biz1/owned_domains': { data: [{ domain_name: 'karriere.test-gmbh.de', is_verified: true }] },
};

describe('Meta-Zugänge prüfen', () => {
  beforeEach(() => {
    process.env.META_SYSTEM_USER_TOKEN = 'token';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('hakt alle Meta-Schritte ab, wenn alles da ist, und speichert gefundene IDs', async () => {
    const { fetchMock, calls } = mockMetaFetch(allesDa);
    vi.stubGlobal('fetch', fetchMock);
    const d = db();
    const r = await pruefeUndUebernehme(d.client, AG);

    expect(r.alle_ok).toBe(true);
    expect(r.abgehakt.sort()).toEqual(['o_meta_domain', 'o_meta_instagram', 'o_meta_pixel', 'o_meta_seite', 'o_meta_werbekonto', 'o_meta_zahlung']);
    expect(d.tables.client_steps.filter((s) => String(s.step_key).startsWith('o_meta_')).every((s) => s.status === 'erledigt')).toBe(true);
    const ag = d.tables.agencies[0];
    expect(ag.meta_page_id).toBe('page1');
    expect(ag.meta_instagram_id).toBe('ig1');
    expect(ag.meta_pixel_id).toBe('px1');
    expect(ag.meta_zugang_pruefung).toBeTruthy();
    // Nur lesende Aufrufe
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('meldet fehlende Zahlungsmethode und fehlenden Pixel als Hinweis am Schritt, ohne abzuhaken', async () => {
    const { fetchMock } = mockMetaFetch({
      ...allesDa,
      'GET /act_123': { account_status: 1, funding_source: null, business: { id: 'biz1' } },
      'GET /act_123/adspixels': { data: [] },
    });
    vi.stubGlobal('fetch', fetchMock);
    const d = db();
    const r = await pruefeUndUebernehme(d.client, AG);

    expect(r.alle_ok).toBe(false);
    const zahlung = d.tables.client_steps.find((s) => s.step_key === 'o_meta_zahlung')!;
    const pixel = d.tables.client_steps.find((s) => s.step_key === 'o_meta_pixel')!;
    expect(zahlung.status).toBe('offen');
    expect(String(zahlung.kommentar)).toMatch(/Zahlungsmethode/);
    expect(pixel.status).toBe('offen');
    expect(String(pixel.kommentar)).toMatch(/Pixel/);
    expect(d.tables.client_steps.find((s) => s.step_key === 'o_meta_seite')!.status).toBe('erledigt');
  });

  it('ohne Werbekonto-ID: Werbekonto fehlt, Zahlung/Pixel unbekannt (bleiben unverändert)', async () => {
    const { fetchMock } = mockMetaFetch({});
    vi.stubGlobal('fetch', fetchMock);
    const d = db({ meta_ad_account_id: null });
    const r = await pruefeUndUebernehme(d.client, AG);
    const st = (k: string) => r.ergebnisse.find((e) => e.step_key === k)!.status;
    expect(st('o_meta_werbekonto')).toBe('fehlt');
    expect(st('o_meta_zahlung')).toBe('unbekannt');
    expect(st('o_meta_pixel')).toBe('unbekannt');
    const zahlung = d.tables.client_steps.find((s) => s.step_key === 'o_meta_zahlung')!;
    expect(zahlung.status).toBe('offen');
    expect(zahlung.kommentar).toBeNull();
  });

  it('periodischer Lauf greift nur bei Automatik-Kunden', async () => {
    const { fetchMock, calls } = mockMetaFetch(allesDa);
    vi.stubGlobal('fetch', fetchMock);
    const alt = db({ automatik: false });
    expect((await metaZugaengeLauf(alt.client, { abstandMinuten: 60 })).geprueft).toBe(0);
    expect(calls.length).toBe(0);
    const neu = db({ automatik: true });
    expect((await metaZugaengeLauf(neu.client, { abstandMinuten: 60 })).geprueft).toBe(1);
  });

  it('periodischer Lauf prüft je Kunde höchstens einmal pro Abstand', async () => {
    const { fetchMock, calls } = mockMetaFetch(allesDa);
    vi.stubGlobal('fetch', fetchMock);
    const d = db({ meta_zugang_geprueft_am: new Date(Date.now() - 5 * 60_000).toISOString() });
    const r = await metaZugaengeLauf(d.client, { abstandMinuten: 60 });
    expect(r.geprueft).toBe(0);
    expect(calls.length).toBe(0);
  });
});
