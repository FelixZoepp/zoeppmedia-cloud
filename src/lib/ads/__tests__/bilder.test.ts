import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';

const signalSafe = vi.fn(async () => {});
vi.mock('@/lib/fulfillment/engine', () => ({
  signalSafe: (...a: unknown[]) => signalSafe(...(a as [])),
  isSignalSatisfied: vi.fn(async () => true),
}));
vi.mock('@/lib/notifications/create', () => ({
  createNotification: vi.fn(async () => {}),
  createNotificationForAgency: vi.fn(async () => {}),
}));
const kiGruen = { ok: true };
vi.mock('../ki-pruefung', () => ({
  pruefeAd: vi.fn(async () => ({})),
  freigabeStatus: vi.fn(() => (kiGruen.ok ? 'ok' : 'rot')),
  darfZumKunden: (s: string) => s === 'ok' || s === 'warnung' || s === 'uebersteuert',
}));

import {
  baueBildPrompt,
  erzeugeBilderFuerAd,
  erzeugeBilderFuerAgentur,
  waehleVariante,
  MAX_BILDER_JE_KUNDE_TAG,
  VARIANTEN,
  type BildVariante,
} from '../bilder';

const AG = 'ag-1';
const NOW = new Date('2026-10-09T10:00:00Z');
const konzept = { art: 'ad_konzept', grafik: { bild_prompt: 'friendly sales team at a doorstep', bildidee: 'Team-Foto' } };

function setup(ads: Array<Record<string, unknown>>, extra: Record<string, Array<Record<string, unknown>>> = {}) {
  const { client, tables } = createFakeDb({
    agencies: [{ id: AG, name: 'Turhan', settings: {} }],
    onboarding_submissions: [{ agency_id: AG, regions: ['Köln'], product: 'Glasfaser', job_title: 'Vertriebler (m/w/d)', created_at: '2026-10-01' }],
    ad_items: ads.map((a) => ({
      agency_id: AG,
      typ: 'grafik',
      stage: 'idee',
      titel: 'Konzept',
      idee: 'Text',
      inhalt: konzept,
      bild_varianten: [],
      bilder_status: null,
      asset_path: null,
      asset_url: null,
      updated_at: '2026-10-09T09:00:00Z',
      ...a,
    })),
    ...extra,
  });
  const uploads: string[] = [];
  const storage = {
    from: () => ({
      upload: vi.fn(async (pfad: string) => {
        uploads.push(pfad);
        return { error: null };
      }),
      createSignedUrl: vi.fn(async (p: string) => ({ data: { signedUrl: `https://x/${p}` } })),
    }),
  };
  const svc = { ...(client as object), storage } as never;
  const generate = vi.fn(async () => ({ data: [{ b64_json: Buffer.from('png').toString('base64') }] }));
  return { svc, tables, uploads, generate, client: { images: { generate } } as never };
}

beforeEach(() => {
  signalSafe.mockClear();
  kiGruen.ok = true;
  delete process.env.OPENAI_API_KEY;
});

describe('KI-Grafiken', () => {
  it('Prompt: Motiv aus dem Generator, Kundendaten, kein Text im Bild', () => {
    const p = baueBildPrompt({ titel: 'X', inhalt: konzept } as never, { firma: 'T', produkt: 'Glasfaser', jobtitel: 'Vertriebler', regionen: ['Köln'], farbe: '#c00' });
    expect(p).toContain('friendly sales team at a doorstep');
    expect(p).toContain('Köln');
    expect(p).toContain('Glasfaser');
    expect(p).toContain('#c00');
    expect(p).toMatch(/no text/i);
  });

  it('erzeugt 3 Varianten, speichert sie und setzt die erste quadratische als Grafik', async () => {
    const { svc, tables, uploads, generate, client } = setup([{ id: 'ad-1' }]);
    const r = await erzeugeBilderFuerAd(svc, 'ad-1', { client, now: NOW });
    expect(r).toEqual({ ergebnis: 'erzeugt', erzeugt: 3 });
    expect(generate).toHaveBeenCalledTimes(3);
    expect(uploads).toHaveLength(3);
    const ad = tables.ad_items[0];
    expect((ad.bild_varianten as BildVariante[]).map((v) => v.groesse)).toEqual(VARIANTEN.map((v) => v.groesse));
    expect(ad.asset_path).toBe((ad.bild_varianten as BildVariante[])[0].pfad);
    expect(ad.bilder_status).toBe('fertig');
  });

  it('idempotent: vorhandene Varianten nicht erneut, laufender Lauf nicht doppelt', async () => {
    const { svc, generate, client } = setup([{ id: 'ad-1' }, { id: 'ad-2', bilder_status: 'laeuft', updated_at: '2026-10-09T09:55:00Z' }]);
    await erzeugeBilderFuerAd(svc, 'ad-1', { client, now: NOW });
    generate.mockClear();
    expect((await erzeugeBilderFuerAd(svc, 'ad-1', { client, now: NOW })).ergebnis).toBe('vorhanden');
    expect((await erzeugeBilderFuerAd(svc, 'ad-2', { client, now: NOW })).ergebnis).toBe('laeuft');
    expect(generate).not.toHaveBeenCalled();
  });

  it('Kostenbremse: höchstens N Bilder je Kunde in 24 Stunden', async () => {
    const heute = Array.from({ length: MAX_BILDER_JE_KUNDE_TAG - 1 }, (_, i) => ({ pfad: `p${i}`, format: '1:1', groesse: '1024x1024', modell: 'm', erstellt_am: '2026-10-09T08:00:00Z' }));
    const { svc, generate, client, tables } = setup([{ id: 'alt', stage: 'live', bild_varianten: heute }, { id: 'ad-1' }, { id: 'ad-2' }]);
    expect((await erzeugeBilderFuerAd(svc, 'ad-1', { client, now: NOW })).erzeugt).toBe(1);
    const r = await erzeugeBilderFuerAd(svc, 'ad-2', { client, now: NOW });
    expect(r.ergebnis).toBe('limit');
    expect(generate).toHaveBeenCalledTimes(1);
    expect(String(tables.ad_items.find((a) => a.id === 'ad-2')!.bilder_status)).toContain('Tageslimit');
  });

  it('ohne OPENAI_API_KEY bleibt es manuell mit klarer Meldung', async () => {
    const { svc, tables } = setup([{ id: 'ad-1' }]);
    const r = await erzeugeBilderFuerAd(svc, 'ad-1', { now: NOW });
    expect(r.ergebnis).toBe('kein_schluessel');
    expect(String(tables.ad_items[0].bilder_status)).toContain('OPENAI_API_KEY');
  });

  it('keine Bilder für Videos oder schon freigegebene Ads', async () => {
    const { svc, generate, client } = setup([{ id: 'v', typ: 'reel' }, { id: 'f', stage: 'bereit' }]);
    expect((await erzeugeBilderFuerAd(svc, 'v', { client, now: NOW })).ergebnis).toBe('uebersprungen');
    expect((await erzeugeBilderFuerAd(svc, 'f', { client, now: NOW })).ergebnis).toBe('uebersprungen');
    expect(generate).not.toHaveBeenCalled();
  });

  it('Agentur-Lauf: grüne KI-Prüfung → Kunden-Freigabe, sonst Bearbeitung; s_grafiken wird abgehakt', async () => {
    const { svc, tables, client } = setup([{ id: 'ad-1' }, { id: 'ad-2' }]);
    await erzeugeBilderFuerAgentur(svc, AG, { adIds: ['ad-1'], client, now: NOW });
    kiGruen.ok = false;
    await erzeugeBilderFuerAgentur(svc, AG, { adIds: ['ad-2'], client, now: NOW });
    expect(tables.ad_items.find((a) => a.id === 'ad-1')!.stage).toBe('freigabe_kunde');
    expect(tables.ad_items.find((a) => a.id === 'ad-2')!.stage).toBe('bearbeitung');
    expect(signalSafe).toHaveBeenCalledWith(svc, AG, 'grafiken_fertig');
  });

  it('Variante wählen: nur eigene Ad in der Freigabe, nur bekannte Pfade', async () => {
    const v = { pfad: 'a/b/ki-1.png', format: '1:1', groesse: '1024x1024', modell: 'm', erstellt_am: '2026-10-09T08:00:00Z' };
    const { svc, tables } = setup([{ id: 'ad-1', stage: 'freigabe_kunde', bild_varianten: [v], asset_path: 'alt.png' }]);
    await expect(waehleVariante(svc, 'ad-1', v.pfad, { kundeAgencyId: 'fremd' })).rejects.toThrow('nicht gefunden');
    await expect(waehleVariante(svc, 'ad-1', 'anderer.png', { kundeAgencyId: AG })).rejects.toThrow('Unbekannte');
    await waehleVariante(svc, 'ad-1', v.pfad, { kundeAgencyId: AG });
    expect(tables.ad_items[0].asset_path).toBe(v.pfad);
  });
});
