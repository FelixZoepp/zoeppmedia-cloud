import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';
import { mockMetaFetch } from './meta-fetch';
import { aktiviereKampagne, legeKampagneAn, pruefeAutostart, regionenAus, tagesbudgetAus } from '../kampagne';

vi.mock('@/lib/notifications/create', () => ({ createNotification: vi.fn(async () => undefined) }));

const AG = 'ag-1';
const ok = (key: string) => ({ step_key: key, label: key, status: 'ok', hinweis: '' });

function db(extra: { agency?: Record<string, unknown>; steps?: Array<Record<string, unknown>>; ads?: Array<Record<string, unknown>> } = {}) {
  return createFakeDb({
    agencies: [
      {
        id: AG,
        name: 'Test GmbH',
        meta_ad_account_id: '123',
        meta_page_id: 'page1',
        meta_pixel_id: 'px1',
        werbebudget: 900,
        settings: {},
        bausteine: ['meta'],
        fulfillment_phase: 'setup',
        meta_zugang_pruefung: { geprueft_am: '2026-10-08', alle_ok: true, ergebnisse: [ok('o_meta_werbekonto'), ok('o_meta_zahlung'), ok('o_meta_seite')] },
        ...extra.agency,
      },
    ],
    onboarding_submissions: [{ id: 'o1', agency_id: AG, meta_daily_budget: '40', regions: ['Köln', 'NRW'], radius_km: 10, updated_at: '2026-10-01' }],
    perspective_funnels: [{ id: 'f1', agency_id: AG, url: 'https://funnel.test/bewerben', status: 'published', updated_at: '2026-10-01' }],
    ad_items: extra.ads ?? [
      { id: 'ad1', agency_id: AG, titel: 'Verdienst', typ: 'grafik', stage: 'bereit', asset_path: 'ag-1/bild.png', asset_url: null, inhalt: { primaertext: 'Text', ueberschrift: 'Jetzt bewerben', beschreibung: 'Ab sofort' }, meta_ad_id: null, meta_creative_id: null, meta_video_id: null },
    ],
    client_steps: extra.steps ?? [
      { id: 's1', agency_id: AG, step_key: 's_werbemanager', phase: 'setup', wer: 'zoepp', status: 'offen' },
      { id: 's2', agency_id: AG, step_key: 's_ads_vorbereitet', phase: 'setup', wer: 'zoepp', status: 'offen' },
      { id: 's3', agency_id: AG, step_key: 's_testlead', phase: 'setup', wer: 'zoepp', status: 'offen' },
      { id: 's4', agency_id: AG, step_key: 's_launch', phase: 'setup', wer: 'zoepp', status: 'offen' },
    ],
  });
}

const routen = {
  'POST /act_123/campaigns': { id: 'c1' },
  'POST /act_123/adsets': { id: 'as1' },
  'POST /act_123/adimages': { images: { 'bild.png': { hash: 'h1' } } },
  'POST /act_123/adcreatives': { id: 'cr1' },
  'POST /act_123/ads': { id: 'a1' },
  'GET /search': (c: { params: Record<string, string> }) => ({ data: [c.params.q === 'NRW' ? { key: '1563', type: 'region' } : { key: '171881', type: 'city' }] }),
  'POST /c1': { success: true },
  'POST /as1': { success: true },
  'POST /a1': { success: true },
};

const deps = { signUrl: async (p: string) => `https://storage.test/${p}?token=x` };

describe('Meta-Kampagne per API', () => {
  beforeEach(() => {
    process.env.META_SYSTEM_USER_TOKEN = 'token';
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('legt Kampagne, Anzeigengruppe und Anzeige PAUSIERT an – Sonderkategorie EMPLOYMENT, Budget, Orte', async () => {
    const { fetchMock, calls } = mockMetaFetch(routen);
    vi.stubGlobal('fetch', fetchMock);
    const d = db();
    const r = await legeKampagneAn(d.client, AG, deps);

    expect(r.ok).toBe(true);
    expect(r.neueAnzeigen).toBe(1);
    const camp = calls.find((c) => c.path === '/act_123/campaigns')!.body!;
    expect(camp.status).toBe('PAUSED');
    expect(camp.special_ad_categories).toEqual(['EMPLOYMENT']);
    expect(camp.special_ad_category_country).toEqual(['DE']);
    expect(camp.objective).toBe('OUTCOME_LEADS');
    expect(camp.daily_budget).toBe(4000);
    const adset = calls.find((c) => c.path === '/act_123/adsets')!.body! as {
      status: string;
      promoted_object: unknown;
      targeting: { genders?: unknown; geo_locations: { cities: unknown[]; regions: unknown[] } };
    };
    expect(adset.status).toBe('PAUSED');
    expect(adset.promoted_object).toEqual({ pixel_id: 'px1', custom_event_type: 'LEAD' });
    expect(adset.targeting.geo_locations.cities[0]).toMatchObject({ key: '171881', radius: 25, distance_unit: 'kilometer' });
    expect(adset.targeting.geo_locations.regions[0]).toEqual({ key: '1563' });
    expect(adset.targeting.genders).toBeUndefined();
    const ad = calls.find((c) => c.path === '/act_123/ads')!.body!;
    expect(ad.status).toBe('PAUSED');
    // Kein einziger Aufruf aktiviert etwas
    expect(calls.some((c) => c.body?.status === 'ACTIVE')).toBe(false);

    expect(d.tables.meta_kampagnen[0]).toMatchObject({ campaign_id: 'c1', adset_id: 'as1', status: 'angelegt' });
    expect(d.tables.ad_items[0]).toMatchObject({ meta_ad_id: 'a1', meta_creative_id: 'cr1', stage: 'bereit' });
    expect(d.tables.client_steps.find((s) => s.step_key === 's_werbemanager')!.status).toBe('erledigt');
    expect(d.tables.client_steps.find((s) => s.step_key === 's_launch')!.status).toBe('offen');
  });

  it('ist idempotent: zweiter Lauf legt nichts doppelt an', async () => {
    const { fetchMock, calls } = mockMetaFetch(routen);
    vi.stubGlobal('fetch', fetchMock);
    const d = db();
    await legeKampagneAn(d.client, AG, deps);
    const vorher = calls.length;
    // Sperre aus dem ersten Lauf ist aufgehoben – zweiter Lauf direkt danach
    const r = await legeKampagneAn(d.client, AG, deps);
    expect(r.ok).toBe(true);
    expect(r.neueAnzeigen).toBe(0);
    expect(calls.slice(vorher).filter((c) => c.method === 'POST')).toHaveLength(0);
    expect(d.tables.meta_kampagnen).toHaveLength(1);
  });

  it('legt nichts an, solange Voraussetzungen fehlen (z. B. Zahlungsmethode nicht bestätigt)', async () => {
    const { fetchMock, calls } = mockMetaFetch(routen);
    vi.stubGlobal('fetch', fetchMock);
    const d = db({ agency: { meta_zugang_pruefung: { geprueft_am: 'x', alle_ok: false, ergebnisse: [ok('o_meta_werbekonto'), ok('o_meta_seite')] } } });
    const r = await legeKampagneAn(d.client, AG, deps);
    expect(r.ok).toBe(false);
    expect(r.fehlt?.join(' ')).toMatch(/Zahlungsmethode/);
    expect(calls).toHaveLength(0);
  });

  it('übernimmt keine schon „live“ gestellten Ads (von Hand im Werbemanager)', async () => {
    const { fetchMock, calls } = mockMetaFetch(routen);
    vi.stubGlobal('fetch', fetchMock);
    const d = db({ ads: [{ id: 'ad1', agency_id: AG, titel: 'Alt', typ: 'grafik', stage: 'live', asset_path: 'x.png', asset_url: null, inhalt: null, meta_ad_id: null }] });
    const r = await legeKampagneAn(d.client, AG, deps);
    expect(r.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it('Meta-Fehler → Status „fehler“, verständliche Meldung, interne Aufgabe', async () => {
    const { fetchMock } = mockMetaFetch({ ...routen, 'POST /act_123/campaigns': { error: { message: 'x', error_user_title: 'Werbekonto gesperrt', error_user_msg: 'Bitte Kontoqualität prüfen.' } } });
    vi.stubGlobal('fetch', fetchMock);
    const d = db();
    const r = await legeKampagneAn(d.client, AG, deps);
    expect(r.fehler).toBe('Werbekonto gesperrt: Bitte Kontoqualität prüfen.');
    expect(d.tables.meta_kampagnen[0].status).toBe('fehler');
    expect(d.tables.internal_tasks?.[0]?.title).toBe('Meta: Kampagne konnte nicht angelegt werden');
  });

  describe('Autostart', () => {
    async function angelegt(agency: Record<string, unknown>, testleadStatus: string) {
      const { fetchMock, calls } = mockMetaFetch(routen);
      vi.stubGlobal('fetch', fetchMock);
      const d = db({ agency });
      d.tables.client_steps.find((s) => s.step_key === 's_testlead')!.status = testleadStatus;
      await legeKampagneAn(d.client, AG, deps);
      return { d, calls };
    }

    it('startet NICHT ohne Einstellung, auch wenn der Test-Lead durch ist', async () => {
      const { d, calls } = await angelegt({ settings: {} }, 'erledigt');
      expect(await pruefeAutostart(d.client, AG)).toBe(false);
      expect(calls.some((c) => c.body?.status === 'ACTIVE')).toBe(false);
    });

    it('startet NICHT mit Einstellung, solange der Test-Lead fehlt', async () => {
      const { d, calls } = await angelegt({ settings: { kampagne_autostart: true } }, 'offen');
      expect(await pruefeAutostart(d.client, AG)).toBe(false);
      expect(calls.some((c) => c.body?.status === 'ACTIVE')).toBe(false);
    });

    it('startet mit Einstellung + erfolgreichem Test-Lead: alles ACTIVE, Ads live, „Kampagne live“ abgehakt', async () => {
      const { d, calls } = await angelegt({ settings: { kampagne_autostart: true } }, 'erledigt');
      expect(await pruefeAutostart(d.client, AG)).toBe(true);
      const aktiv = calls.filter((c) => c.body?.status === 'ACTIVE').map((c) => c.path);
      expect(aktiv).toEqual(['/c1', '/as1', '/a1']);
      expect(d.tables.meta_kampagnen[0].status).toBe('aktiv');
      expect(d.tables.ad_items[0].stage).toBe('live');
      expect(d.tables.client_steps.find((s) => s.step_key === 's_launch')!.status).toBe('erledigt');
    });
  });

  it('Knopf „starten“ lässt „Kampagne live“ offen, wenn zusätzlich Indeed gebucht ist', async () => {
    const { fetchMock } = mockMetaFetch(routen);
    vi.stubGlobal('fetch', fetchMock);
    const d = db({ agency: { bausteine: ['meta', 'indeed'] } });
    await legeKampagneAn(d.client, AG, deps);
    const r = await aktiviereKampagne(d.client, AG, { quelle: 'knopf', userId: 'u1' });
    expect(r.ok).toBe(true);
    expect(d.tables.client_steps.find((s) => s.step_key === 's_launch')!.status).toBe('offen');
  });
});

describe('Hilfsfunktionen', () => {
  it('Tagesbudget: Onboarding vor Monatsbudget/30', () => {
    expect(tagesbudgetAus({ meta_daily_budget: '35' }, 900)).toBe(35);
    expect(tagesbudgetAus(null, 900)).toBe(30);
    expect(tagesbudgetAus(null, null)).toBeNull();
  });
  it('Regionen aus regions[] oder region-Text', () => {
    expect(regionenAus({ regions: ['Köln', ' Bonn ', 'Köln'] })).toEqual(['Köln', 'Bonn']);
    expect(regionenAus({ region: 'Berlin, Potsdam' })).toEqual(['Berlin', 'Potsdam']);
  });
});
