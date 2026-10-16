import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';
import { mockMetaFetch } from './meta-fetch';
import { metaFehlerArt, parseKampagnenZeile, pruefeWerbekonto, syncKampagnenKosten } from '../kampagnen-kosten';

describe('parseKampagnenZeile', () => {
  it('liest Ausgaben, Klicks und Leads (größter Lead-Wert, nicht doppelt)', () => {
    expect(
      parseKampagnenZeile({
        campaign_id: '120200001',
        campaign_name: 'Vertrieb Berlin',
        date_start: '2026-10-14',
        spend: '42.505',
        impressions: '1000',
        clicks: '30',
        actions: [
          { action_type: 'lead', value: '4' },
          { action_type: 'onsite_conversion.lead_grouped', value: '4' },
          { action_type: 'link_click', value: '30' },
        ],
      }),
    ).toEqual({ campaign_id: '120200001', campaign_name: 'Vertrieb Berlin', datum: '2026-10-14', spend: 42.51, impressions: 1000, clicks: 30, leads: 4 });
  });

  it('ohne Kampagnen-ID oder Datum → null, ohne Aktionen → 0 Leads', () => {
    expect(parseKampagnenZeile({ date_start: '2026-10-14' })).toBeNull();
    expect(parseKampagnenZeile({ campaign_id: '1', date_start: '2026-10-14' })?.leads).toBe(0);
  });
});

describe('metaFehlerArt', () => {
  it('erkennt fehlenden Zugriff, ungültigen Token und Sonstiges', () => {
    expect(metaFehlerArt({ code: 200, message: 'Requires ads_read permission' })).toBe('kein_zugriff');
    expect(metaFehlerArt({ code: 100, message: "Unsupported get request. Object with ID 'act_1' does not exist" })).toBe('kein_zugriff');
    expect(metaFehlerArt({ code: 10, message: 'x' })).toBe('kein_zugriff');
    expect(metaFehlerArt({ code: 190, message: 'Error validating access token' })).toBe('token_ungueltig');
    expect(metaFehlerArt({ code: 2, message: 'Service temporarily unavailable' })).toBe('fehler');
  });
});

describe('syncKampagnenKosten', () => {
  const jetzt = new Date('2026-10-16T08:00:00Z');
  beforeEach(() => {
    process.env.META_SYSTEM_USER_TOKEN = 'token';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.META_SYSTEM_USER_TOKEN;
  });

  const db = () =>
    createFakeDb({
      agencies: [
        { id: 'a1', meta_ad_account_id: '111', settings: { x: 1 } },
        { id: 'a2', meta_ad_account_id: 'act_222', settings: null },
        { id: 'a3', meta_ad_account_id: null, settings: null },
      ],
      meta_kampagnen_kosten: [{ campaign_id: 'c1', datum: '2026-10-15', spend: 1, agency_id: 'a1' }],
    });

  it('gleicht je Kunde ab, ein Fehler stoppt die anderen nicht und wird gemerkt', async () => {
    const { fetchMock, calls } = mockMetaFetch({
      'GET /act_111/insights': {
        data: [
          { campaign_id: 'c1', campaign_name: 'K1', date_start: '2026-10-15', spend: '10.5', impressions: '100', clicks: '5' },
          { campaign_id: 'c1', campaign_name: 'K1', date_start: '2026-10-16', spend: '3', impressions: '20', clicks: '1' },
        ],
      },
      'GET /act_222/insights': { error: { code: 200, message: 'Requires ads_read permission' } },
    });
    vi.stubGlobal('fetch', fetchMock);
    const f = db();
    const r = await syncKampagnenKosten(f.client, { jetzt });

    expect(r.status).toBe('ok');
    expect(r.zeilen).toBe(2);
    expect(r.kunden.map((k) => [k.agency_id, k.status])).toEqual([
      ['a1', 'ok'],
      ['a2', 'kein_zugriff'],
    ]);
    expect(calls[0].params).toMatchObject({ level: 'campaign', time_increment: '1', time_range: JSON.stringify({ since: '2026-10-10', until: '2026-10-16' }) });
    const kosten = f.tables.meta_kampagnen_kosten;
    expect(kosten).toHaveLength(2);
    expect(kosten.find((k) => k.datum === '2026-10-15')).toMatchObject({ spend: 10.5, agency_id: 'a1' });
    const a2 = f.tables.agencies.find((a) => a.id === 'a2')!;
    expect((a2.settings as { meta_sync: { status: string } }).meta_sync.status).toBe('kein_zugriff');
    const a1 = f.tables.agencies.find((a) => a.id === 'a1')!;
    expect(a1.settings).toMatchObject({ x: 1, meta_sync: { status: 'ok' } });
  });

  it('ohne Token: Meta nicht verbunden, kein Abruf', async () => {
    delete process.env.META_SYSTEM_USER_TOKEN;
    delete process.env.META_ACCESS_TOKEN;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect((await syncKampagnenKosten(db().client, { jetzt })).status).toBe('nicht_verbunden');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nur ein Kunde auf Wunsch', async () => {
    const { fetchMock, calls } = mockMetaFetch({ 'GET /act_222/insights': { data: [] } });
    vi.stubGlobal('fetch', fetchMock);
    const r = await syncKampagnenKosten(db().client, { jetzt, agencyId: 'a2' });
    expect(r.kunden).toEqual([{ agency_id: 'a2', status: 'ok', zeilen: 0 }]);
    expect(calls).toHaveLength(1);
  });
});

describe('pruefeWerbekonto', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.META_SYSTEM_USER_TOKEN;
  });

  it('liefert Name, Währung und Status', async () => {
    process.env.META_SYSTEM_USER_TOKEN = 'token';
    const { fetchMock } = mockMetaFetch({ 'GET /act_123': { id: 'act_123', name: 'Kunde GmbH', currency: 'EUR', account_status: 1 } });
    vi.stubGlobal('fetch', fetchMock);
    expect(await pruefeWerbekonto('123')).toEqual({ ok: true, konto: { id: 'act_123', name: 'Kunde GmbH', waehrung: 'EUR', status: 'Aktiv', aktiv: true, business: null } });
  });

  it('kein Zugriff bzw. ungültige Eingabe', async () => {
    process.env.META_SYSTEM_USER_TOKEN = 'token';
    const { fetchMock } = mockMetaFetch({ 'GET /act_123': { error: { code: 100, message: 'Object does not exist, cannot be loaded due to missing permissions' } } });
    vi.stubGlobal('fetch', fetchMock);
    expect(await pruefeWerbekonto('act_123')).toMatchObject({ ok: false, art: 'kein_zugriff', meldung: 'Kein Zugriff auf Werbekonto' });
    expect(await pruefeWerbekonto('abc')).toMatchObject({ ok: false, art: 'ungueltig' });
  });
});
