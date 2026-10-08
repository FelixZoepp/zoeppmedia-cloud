import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';
import { STEPS } from '@/lib/fulfillment/catalog';
import { START_ARTIKEL, VIDEOS } from '../inhalte';
import { SCHRITT_SOP } from '../schritt-index';
import { berechneZugriff, darfSehen } from '../zugriff';
import { gruppiereAufnahmen, ladeSichtbareArtikel, setzeStartInhaltePruefungZurueck, sucheArtikel, zeileAusDef, type Video } from '../daten';
import { beantworteFrage, LUECKEN_ANTWORT } from '../bot';
import { erzeugeEntwuerfe } from '../import';
import type { KiFn } from '../ki';
import { toolsFor } from '@/lib/assistant/tools';

const setter = { id: 'u-setter', role: 'employee', funktion: 'setter' };
const buyer = { id: 'u-buyer', role: 'employee', funktion: 'media_buyer' };
const admin = { id: 'u-admin', role: 'admin', funktion: 'csm' };

beforeEach(() => setzeStartInhaltePruefungZurueck());

describe('Akademie: Inhalte', () => {
  it('Schritt-Index passt zu den Start-Artikeln', () => {
    const abgeleitet: Record<string, string> = {};
    for (const a of START_ARTIKEL) for (const k of a.step_keys ?? []) abgeleitet[k] ??= a.slug;
    expect(SCHRITT_SOP).toEqual(abgeleitet);
  });

  it('jeder Ablauf-Schritt aus catalog.ts hat eine SOP', () => {
    const ohne = STEPS.map((s) => s.key).filter((k) => !SCHRITT_SOP[k]);
    expect(ohne).toEqual([]);
  });

  it('jede verknüpfte video_key existiert, Skripte/Rollen sind Entwürfe', () => {
    const keys = new Set(VIDEOS.map((v) => v.key));
    for (const a of START_ARTIKEL) if (a.video_key) expect(keys.has(a.video_key)).toBe(true);
    for (const a of START_ARTIKEL.filter((x) => x.typ === 'skript' || x.typ === 'rolle')) expect(a.status).toBe('entwurf');
  });
});

describe('Akademie: Freischaltung', () => {
  const art = (slug: string, positionen: string[], status = 'freigegeben') => ({ slug, positionen, status });

  it('Setter sieht Setting + Grundlagen, aber nicht Ads & Funnel', () => {
    const z = berechneZugriff(setter, [], []);
    expect(darfSehen(art('a', ['setting']), z)).toBe(true);
    expect(darfSehen(art('b', ['grundlagen']), z)).toBe(true);
    expect(darfSehen(art('c', ['media_buyer']), z)).toBe(false);
  });

  it('Entwürfe sehen nur Admins', () => {
    expect(darfSehen(art('a', ['setting'], 'entwurf'), berechneZugriff(setter, [], []))).toBe(false);
    expect(darfSehen(art('a', ['setting'], 'entwurf'), berechneZugriff(admin, [], []))).toBe(true);
  });

  it('Schalter überschreiben den Vorschlag, einzelne Artikel an/aus', () => {
    const z = berechneZugriff(setter, [{ position: 'setting', an: false }, { position: 'closing', an: true }], [{ slug: 'x', an: true }, { slug: 'y', an: false }]);
    expect(darfSehen(art('a', ['setting']), z)).toBe(false);
    expect(darfSehen(art('b', ['closing']), z)).toBe(true);
    expect(darfSehen(art('x', ['media_buyer']), z)).toBe(true);
    expect(darfSehen(art('y', ['grundlagen']), z)).toBe(false);
  });

  it('Kunden sehen nichts', () => {
    const z = berechneZugriff({ id: 'k', role: 'agency_owner', funktion: null }, [{ position: 'grundlagen', an: true }], [{ slug: 'cloud-rundgang', an: true }]);
    expect(darfSehen(art('cloud-rundgang', ['grundlagen']), z)).toBe(false);
  });

  it('Liste und Suche liefern Mitarbeitern ohne Freigabe den Artikel nicht', async () => {
    const db = createFakeDb();
    const z = berechneZugriff(setter, [], []);
    const liste = await ladeSichtbareArtikel(db.client, z);
    expect(liste.some((a) => a.slug === 'funnel')).toBe(false);
    expect(liste.some((a) => a.slug === 'close-pflege')).toBe(true);
    expect(liste.some((a) => a.status === 'entwurf')).toBe(false);
    const treffer = await sucheArtikel(db.client, z, 'Pixel Webhook Funnel');
    expect(treffer.some((a) => a.slug === 'funnel')).toBe(false);
    const fuerBuyer = await sucheArtikel(db.client, berechneZugriff(buyer, [], []), 'Pixel Webhook Funnel');
    expect(fuerBuyer.some((a) => a.slug === 'funnel')).toBe(true);
  });
});

describe('Akademie-Bot', () => {
  it('ohne Treffer: ehrliche Antwort, Wissenslücke, kein KI-Aufruf', async () => {
    const db = createFakeDb();
    const ki = vi.fn<KiFn>();
    const r = await beantworteFrage(db.client, setter, 'Firmenwagen Tankkarte quxquux?', { ki, zugriff: berechneZugriff(setter, [], []) });
    expect(ki).not.toHaveBeenCalled();
    expect(r.luecke).toBe(true);
    expect(r.antwort).toBe(LUECKEN_ANTWORT);
    expect(db.tables.akademie_luecken).toHaveLength(1);
    await beantworteFrage(db.client, setter, 'Firmenwagen Tankkarte quxquux', { ki, zugriff: berechneZugriff(setter, [], []) });
    expect(db.tables.akademie_luecken).toHaveLength(1);
    expect(db.tables.akademie_luecken[0].anzahl).toBe(2);
  });

  it('Kontext enthält nur freigeschaltete Artikel, Quellen werden aus [n] gelesen', async () => {
    const db = createFakeDb();
    let prompt = '';
    const ki: KiFn = async (a) => {
      prompt = a.prompt;
      return 'Status in Close setzen [1].';
    };
    const r = await beantworteFrage(db.client, setter, 'Close Status Follow-up', { ki, zugriff: berechneZugriff(setter, [], []) });
    expect(r.luecke).toBe(false);
    expect(r.quellen.length).toBe(1);
    expect(prompt).not.toContain('Funnel bauen und prüfen');
    expect(prompt).not.toContain('Felix ergänzt');
    expect(db.tables.akademie_bot_antworten).toHaveLength(1);
  });

  it('KEINE_ANLEITUNG der KI wird zur Wissenslücke', async () => {
    const db = createFakeDb();
    const r = await beantworteFrage(db.client, setter, 'Close Status Follow-up Rhythmus', { ki: async () => 'KEINE_ANLEITUNG', zugriff: berechneZugriff(setter, [], []) });
    expect(r.luecke).toBe(true);
    expect(db.tables.akademie_luecken).toHaveLength(1);
  });
});

describe('Akademie: Aufnahme-Liste', () => {
  it('bündelt nur offene Videos zu Sessions mit Gesamtdauer und SOPs', () => {
    const v = (key: string, session: string, prio: number, min: number, status: Video['status'] = 'aufnahme_noetig'): Video => ({ key, titel: key, session, session_reihenfolge: 1, laenge_min: min, prioritaet: prio, drehbuch: [], video_url: null, status });
    const r = gruppiereAufnahmen(
      [v('a', 'B', 2, 4), v('b', 'A', 1, 5), v('c', 'A', 1, 3), v('d', 'A', 1, 9, 'aufgenommen')],
      [{ slug: 's1', titel: 'SOP 1', video_key: 'b' }],
    );
    expect(r.anzahl).toBe(3);
    expect(r.gesamtMin).toBe(12);
    expect(r.sessions.map((s) => s.session)).toEqual(['A', 'B']);
    expect(r.sessions[0].gesamtMin).toBe(8);
    expect(r.sessions[0].videos.find((x) => x.key === 'b')?.sops).toEqual([{ slug: 's1', titel: 'SOP 1' }]);
  });
});

describe('Akademie: Wissen einspeisen', () => {
  const db0 = () => createFakeDb({ akademie_artikel: START_ARTIKEL.map(zeileAusDef) });

  it('erzeugt Entwürfe (unsichtbar), filtert Positionen, Ergänzung nur bei existierendem Ziel', async () => {
    const db = db0();
    const ki: KiFn = async () =>
      JSON.stringify({
        entwuerfe: [
          { aktion: 'neu', typ: 'skript', titel: 'Closing Leitfaden Teil 2', positionen: ['closing', 'quatsch'], zusammenfassung: 'x', inhalt: '## Abschluss\n- Frage stellen' },
          { aktion: 'ergaenzung', ziel_slug: 'skript-closing', typ: 'skript', titel: 'Preisgespräch', positionen: ['closing'], zusammenfassung: '', inhalt: 'Preis nennen, dann schweigen.' },
          { aktion: 'ergaenzung', ziel_slug: 'gibt-es-nicht', typ: 'wissen', titel: 'Waise', positionen: [], zusammenfassung: '', inhalt: 'Irgendwas Wichtiges hier.' },
        ],
      });
    const r = await erzeugeEntwuerfe(db.client, { art: 'text', titel: 'Notizen', text: 'Felix erklärt das Closing ausführlich mit Beispielen.', erstelltVon: 'u-admin' }, { ki });
    expect(r.slugs).toHaveLength(3);
    const neu = db.tables.akademie_artikel.filter((a) => r.slugs.includes(String(a.slug)));
    expect(neu.every((a) => a.status === 'entwurf')).toBe(true);
    expect(neu[0].positionen).toEqual(['closing']);
    expect(neu[1].ergaenzt_slug).toBe('skript-closing');
    expect(neu[2].ergaenzt_slug).toBeNull();
    expect(neu[2].positionen).toEqual(['grundlagen']);
    expect(db.tables.akademie_importe[0].status).toBe('verarbeitet');
    // Entwürfe tauchen für Mitarbeiter nicht auf
    const liste = await ladeSichtbareArtikel(db.client, berechneZugriff({ id: 'c', role: 'employee', funktion: 'closer' }, [], []));
    expect(liste.some((a) => r.slugs.includes(a.slug))).toBe(false);
  });

  it('unbrauchbare KI-Antwort → Fehler und Import als fehlgeschlagen markiert', async () => {
    const db = db0();
    await expect(erzeugeEntwuerfe(db.client, { art: 'text', titel: 'X', text: 'Genug Text für einen Import vorhanden.', erstelltVon: 'u' }, { ki: async () => 'kein json' })).rejects.toThrow();
    expect(db.tables.akademie_importe[0].status).toBe('fehler');
  });
});

describe('KI-Assistent: Akademie-Werkzeug', () => {
  it('sop_suchen nur intern', () => {
    expect(toolsFor('team', 'setter').map((t) => t.tool.name)).toContain('sop_suchen');
    expect(toolsFor('admin').map((t) => t.tool.name)).toContain('sop_suchen');
    expect(toolsFor('kunde').map((t) => t.tool.name)).not.toContain('sop_suchen');
  });
});
