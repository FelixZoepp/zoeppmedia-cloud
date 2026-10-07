import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createFakeDb } from './fake-db';

const konzept = {
  winkel: 'Verdienst', hook: 'Bis zu 6.000 € im Monat', primaertext: 'Text', ueberschrift: 'Jetzt bewerben', beschreibung: 'In 60 Sek.',
  grafik: { text_auf_grafik: 'Bis zu 6.000 €', bildidee: 'Team-Foto', bild_prompt: 'sales team', format: '4:5' },
};
const szene = { sekunden: '0–3', bild: 'Gesicht', gesprochen: 'Hallo', text_overlay: 'Hook' };
const antworten: Record<string, unknown> = {
  ads: { konzepte: [konzept, { ...konzept, winkel: 'Quereinstieg' }] },
  videos: { skripte: [{ titel: 'Tag im Außendienst', winkel: 'Alltag', laenge_sekunden: 30, sprecher: 'GF', szenen: [szene], cta: 'Bewirb dich', drehanleitung: ['Hochformat'] }] },
  webseiten_video: { titel: 'Wer wir sind', ziel: 'Vertrauen', laenge_sekunden: 80, sprecher: 'GF', szenen: [szene], drehanleitung: ['Licht von vorn'] },
  funnel: { headline: 'H', subheadline: 'S', vorteile: ['A'], quiz: [{ frage: 'F', antworten: ['Ja', 'Nein'] }], formular_text: 'Form', danke_text: 'Danke', perspective_prompt: 'Baue …' },
};

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      parse: vi.fn(async ({ messages }: { messages: Array<{ content: string }> }) => {
        const t = messages[0].content;
        const teil = t.includes('Meta-Ad-Konzepte') ? 'ads' : t.includes('Video-Ad-Skripte') ? 'videos' : t.includes('Karriereseite') ? 'webseiten_video' : 'funnel';
        if (t.includes('KAPUTT') && teil === 'funnel') throw new Error('401 authentication_error');
        return { parsed_output: antworten[teil] };
      }),
    };
  },
}));
vi.mock('@anthropic-ai/sdk/helpers/zod', () => ({ zodOutputFormat: () => ({}) }));
vi.mock('@/lib/indeed/anzeige', async (orig) => ({
  ...(await orig<typeof import('@/lib/indeed/anzeige')>()),
  ladeBriefing: vi.fn(async () => ({ firma: 'Turhan', jobtitel: 'Vertriebler (m/w/d)', regionen: ['Köln'], ansprache: 'du', karrierestufen: [], extras: [] })),
  generiereIndeedAnzeige: vi.fn(async () => ({ titel: 'Vertriebler (m/w/d)', arbeitsort: 'Köln', anstellungsart: 'Vollzeit', gehalt_von: null, gehalt_bis: null, gehalt_zeitraum: null, text: 'T', offene_punkte: [] })),
}));
const speichere = vi.fn(async () => {});
vi.mock('@/lib/indeed/speichern', () => ({ speichereIndeedAnzeige: (...a: unknown[]) => speichere(...(a as [])) }));
vi.mock('../engine', () => ({ signalSafe: vi.fn(async () => {}) }));

import { teileFuer, starteGenerierung, fuehreGenerierungAus, konzeptAlsText } from '../generator';

const AG = 'ag-1';
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test';
  speichere.mockClear();
});

describe('Fulfillment-Generator', () => {
  it('Teile nach gebuchten Leistungen', () => {
    expect(teileFuer(['indeed'])).toEqual(['indeed']);
    expect(teileFuer(['indeed', 'meta'])).toEqual(['ads', 'videos', 'webseiten_video', 'funnel', 'indeed']);
    expect(teileFuer(['innendienst'])).toEqual([]);
  });

  it('Konzept wird lesbar fürs Ads-Board', () => {
    const t = konzeptAlsText(konzept);
    expect(t).toContain('Hook: Bis zu 6.000 € im Monat');
    expect(t).toContain('• Text auf der Grafik: Bis zu 6.000 €');
  });

  it('erzeugt alles, legt Ads im Board an und Inhalte als Version ab', async () => {
    const { client, tables } = createFakeDb({ agencies: [{ id: AG, bausteine: ['indeed', 'meta'] }] });
    const { id, teile } = await starteGenerierung(client, AG, 'u1', null);
    await fuehreGenerierungAus(client, id, AG, 'u1', teile, 'Firmenwagen ab Teamleiter');

    const ads = tables.ad_items;
    expect(ads.filter((a) => a.typ === 'grafik' && a.stage === 'idee')).toHaveLength(2);
    expect(ads.filter((a) => a.typ === 'reel' && a.stage === 'material')).toHaveLength(1);
    expect(tables.fulfillment_inhalte.map((x) => x.art).sort()).toEqual(['funnel', 'webseiten_video']);
    expect(speichere).toHaveBeenCalledTimes(1);
    const gen = tables.fulfillment_generierungen[0];
    expect(gen.status).toBe('fertig');
    expect(gen.teile).toEqual({ ads: 'fertig', videos: 'fertig', webseiten_video: 'fertig', funnel: 'fertig', indeed: 'fertig' });
  });

  it('ein Teil scheitert → Rest kommt trotzdem, Fehler steht dran', async () => {
    const { client, tables } = createFakeDb({ agencies: [{ id: AG, bausteine: ['meta'] }] });
    const { id, teile } = await starteGenerierung(client, AG, 'u1', null);
    await fuehreGenerierungAus(client, id, AG, 'u1', teile, 'KAPUTT');
    const gen = tables.fulfillment_generierungen[0];
    expect(gen.status).toBe('fertig');
    expect(String((gen.teile as Record<string, string>).funnel)).toBe('fehler: KI-Schlüssel ungültig');
    expect((gen.teile as Record<string, string>).ads).toBe('fertig');
  });

  it('läuft schon eine Generierung, startet keine zweite', async () => {
    const { client } = createFakeDb({ agencies: [{ id: AG, bausteine: ['meta'] }] });
    await starteGenerierung(client, AG, 'u1', null);
    await expect(starteGenerierung(client, AG, 'u1', null)).rejects.toThrow('läuft gerade schon');
  });
});
