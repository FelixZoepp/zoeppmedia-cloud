import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';
import {
  beantworteFragen,
  darfAufnehmen,
  istVerarbeitbar,
  pruefeAnlage,
  verarbeiteAufnahme,
  type AnlageEingabe,
} from '../aufnahme';
import type { KiBildFn } from '../ki';

/* ── Route: Upload-URLs nur für Admins (bzw. freigeschaltete) ─────────────── */

const authMock = vi.hoisted(() => ({ user: null as null | { id: string; role: string; funktion?: string | null } }));
const dbMock = vi.hoisted(() => ({ client: null as unknown }));
vi.mock('@/lib/auth', () => ({ getCurrentUser: async () => authMock.user }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => dbMock.client }));

function mitStorage(db: ReturnType<typeof createFakeDb>) {
  return Object.assign(db.client as object, {
    storage: { from: () => ({ createSignedUploadUrl: async (p: string) => ({ data: { signedUrl: `https://speicher.test/${p}?token=t` }, error: null }) }) },
  });
}

const anlage = {
  modus: 'bildschirm',
  titel: 'Meta-Kampagne starten',
  kontext: { pfad: '/clients/x/ablauf', seitentitel: 'Ablauf' },
  audioTeile: 1,
  bilder: 2,
  video: { mime: 'video/webm', bytes: 1000 },
  dauerSek: 120,
  groesseBytes: 5000,
};

describe('SOP aus Aufnahme: Anlegen', () => {
  beforeEach(() => {
    const db = createFakeDb({ system_einstellungen: [{ key: 'akademie_aufnahme_erlaubt', wert: 'u-erlaubt' }] });
    dbMock.client = mitStorage(db);
  });

  async function post() {
    const { POST } = await import('@/app/api/akademie/aufnahmen/route');
    return POST(new Request('http://x/api/akademie/aufnahmen', { method: 'POST', body: JSON.stringify(anlage) }) as never);
  }

  it('Mitarbeiter ohne Freischaltung bekommt keine Upload-URLs', async () => {
    authMock.user = { id: 'u-setter', role: 'employee', funktion: 'setter' };
    expect((await post()).status).toBe(403);
  });

  it('Kunde bekommt keine Upload-URLs', async () => {
    authMock.user = { id: 'u-kunde', role: 'agency_owner' };
    expect((await post()).status).toBe(403);
  });

  it('Admin bekommt Upload-URLs für Audio, Standbilder und Video', async () => {
    authMock.user = { id: 'u-admin', role: 'admin' };
    const res = await post();
    expect(res.status).toBe(200);
    const d = (await res.json()) as { id: string; uploads: Array<{ art: string; pfad: string; signedUrl: string }> };
    expect(d.uploads.map((u) => u.art).sort()).toEqual(['audio', 'bild', 'bild', 'video']);
    expect(d.uploads.every((u) => u.pfad.startsWith(`${d.id}/`) && u.signedUrl.includes(u.pfad))).toBe(true);
  });

  it('freigeschalteter Mitarbeiter darf aufnehmen', async () => {
    const db = createFakeDb({ system_einstellungen: [{ key: 'akademie_aufnahme_erlaubt', wert: 'u-erlaubt, u-zwei' }] });
    expect(await darfAufnehmen(db.client, { id: 'u-erlaubt', role: 'employee' })).toBe(true);
    expect(await darfAufnehmen(db.client, { id: 'u-anderer', role: 'employee' })).toBe(false);
    expect(await darfAufnehmen(db.client, { id: 'u-erlaubt', role: 'agency_owner' })).toBe(false);
  });

  it('Grenzen: 20 Minuten, 40 Standbilder, 500 MB Video', () => {
    const basis = anlage as AnlageEingabe;
    expect(pruefeAnlage(basis)).toBeNull();
    expect(pruefeAnlage({ ...basis, dauerSek: 25 * 60 })).toMatch(/20 Minuten/);
    expect(pruefeAnlage({ ...basis, bilder: 41 })).toMatch(/40/);
    expect(pruefeAnlage({ ...basis, video: { mime: 'video/webm', bytes: 600 * 1024 * 1024 } })).toMatch(/500 MB/);
    expect(pruefeAnlage({ ...basis, audioTeile: 0 })).toMatch(/Audio/);
  });
});

/* ── Pipeline ─────────────────────────────────────────────────────────────── */

const entwurfJson = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({
    aktion: 'neu',
    ziel_slug: null,
    titel: 'Meta-Kampagne starten',
    modul: 'Setup',
    positionen: ['media_buyer', 'erfunden'],
    step_keys: ['s_launch', 'gibt_es_nicht'],
    zusammenfassung: 'So startest du die pausierte Kampagne.',
    abschnitte: {
      zweck: 'Kampagne live schalten',
      ausloeser: 'Wenn der Test-Lead erfolgreich war',
      automatisch: ['Die Cloud legt die Kampagne pausiert an'],
      schritte: ['Öffne den Kunden-Ablauf', 'Klicke auf „Kampagne starten“'],
      qualitaet: ['Status in der Meta-Karte ist „aktiv“'],
      fehler: ['Budget nicht geprüft'],
      links: [{ label: 'Kunden', href: '/clients' }, { label: 'extern', href: 'https://evil.test' }],
    },
    offene_fragen: [],
    ...extra,
  });

function aufnahmeZeile(extra: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    erstellt_von: 'u-admin',
    modus: 'bildschirm',
    titel: 'Kampagne starten',
    hinweis: null,
    kontext: { pfad: '/clients/x/ablauf', seitentitel: 'Ablauf' },
    video_pfad: 'a1/video.webm',
    audio_pfade: ['a1/audio-0.webm'],
    bild_pfade: ['a1/bild-00.jpg', 'a1/bild-01.jpg'],
    dauer_sek: 180,
    groesse_bytes: 1000,
    status: 'wartet',
    fehler: null,
    transkript: null,
    artikel_slug: null,
    video_key: null,
    offene_fragen: [],
    versuche: 0,
    verarbeitung_seit: null,
    created_at: '2026-10-08T10:00:00Z',
    updated_at: '2026-10-08T10:00:00Z',
    ...extra,
  };
}

const deps = (ki: KiBildFn) => ({
  ladeDatei: async (p: string) => Buffer.from(p.endsWith('.jpg') ? 'bild' : 'x'.repeat(5000)),
  transkribiere: async () => 'Hier siehst du den Kunden-Ablauf. Jetzt klickst du auf Kampagne starten und prüfst das Budget.',
  ki,
  benachrichtige: vi.fn(async () => {}),
});

describe('SOP aus Aufnahme: Verarbeitung', () => {
  it('Transkript → Entwurf → Prüfung → offene Fragen, Video verknüpft', async () => {
    const db = createFakeDb({ akademie_aufnahmen: [aufnahmeZeile()], akademie_artikel: [], akademie_videos: [] });
    const aufrufe: Array<{ system: string; bilder: number }> = [];
    const ki: KiBildFn = async (a) => {
      aufrufe.push({ system: a.system, bilder: a.bilder.length });
      return aufrufe.length === 1 ? entwurfJson() : entwurfJson({ offene_fragen: ['Ab welchem Tagesbudget muss Felix freigeben?'] });
    };
    const d = deps(ki);
    expect(await verarbeiteAufnahme(db.client, 'a1', d)).toBe('fertig');

    expect(aufrufe).toHaveLength(2);
    expect(aufrufe[0].bilder).toBe(2);
    expect(aufrufe[1].system).toMatch(/strenge Prüfer/);

    const a = db.tables.akademie_aufnahmen[0];
    expect(a.status).toBe('fertig');
    expect(a.transkript).toMatch(/Kampagne starten/);
    expect(a.offene_fragen).toEqual([{ frage: 'Ab welchem Tagesbudget muss Felix freigeben?', antwort: null }]);

    const art = db.tables.akademie_artikel[0];
    expect(art.status).toBe('entwurf');
    expect(art.typ).toBe('sop');
    expect(art.positionen).toEqual(['media_buyer']);
    expect(art.step_keys).toEqual(['s_launch']);
    expect((art.abschnitte as { links: unknown[] }).links).toEqual([{ label: 'Kunden', href: '/clients' }]);
    expect(art.video_key).toBe('aufnahme_a1');
    expect(db.tables.akademie_videos[0]).toMatchObject({ key: 'aufnahme_a1', status: 'aufgenommen', video_url: 'storage:akademie-aufnahmen/a1/video.webm' });
    expect(d.benachrichtige).toHaveBeenCalledOnce();
  });

  it('läuft nicht doppelt: fertige Aufnahme wird ohne erzwingen übersprungen', async () => {
    const db = createFakeDb({ akademie_aufnahmen: [aufnahmeZeile({ status: 'fertig' })], akademie_artikel: [] });
    const ki = vi.fn<KiBildFn>(async () => entwurfJson());
    expect(await verarbeiteAufnahme(db.client, 'a1', deps(ki))).toBe('uebersprungen');
    expect(ki).not.toHaveBeenCalled();
  });

  it('hängengebliebene Verarbeitung wird übernommen, frische nicht', () => {
    const jetzt = new Date('2026-10-08T12:00:00Z');
    expect(istVerarbeitbar({ status: 'entwurf', verarbeitung_seit: '2026-10-08T11:59:00Z', versuche: 1 }, jetzt)).toBe(false);
    expect(istVerarbeitbar({ status: 'entwurf', verarbeitung_seit: '2026-10-08T11:30:00Z', versuche: 1 }, jetzt)).toBe(true);
    expect(istVerarbeitbar({ status: 'entwurf', verarbeitung_seit: '2026-10-08T11:30:00Z', versuche: 3 }, jetzt)).toBe(false);
  });

  it('passt die Aufnahme zu einem bestehenden Artikel → Ergänzung statt Duplikat', async () => {
    const db = createFakeDb({
      akademie_aufnahmen: [aufnahmeZeile({ video_pfad: null, bild_pfade: [] })],
      akademie_artikel: [{ slug: 'meta-kampagne', titel: 'Meta-Kampagne prüfen & starten', typ: 'sop', positionen: ['media_buyer'], status: 'freigegeben' }],
    });
    const ki: KiBildFn = async () => entwurfJson({ aktion: 'ergaenzung', ziel_slug: 'meta-kampagne' });
    expect(await verarbeiteAufnahme(db.client, 'a1', deps(ki))).toBe('fertig');
    const neu = db.tables.akademie_artikel.find((x) => x.slug !== 'meta-kampagne')!;
    expect(neu.ergaenzt_slug).toBe('meta-kampagne');
    expect(neu.titel).toMatch(/^Ergänzung: /);
    expect(String(neu.inhalt)).toMatch(/## Das machst du/);
    expect(db.tables.akademie_artikel).toHaveLength(2);
  });

  it('fast leere Aufnahme → Fehlerstatus mit verständlicher Meldung', async () => {
    const db = createFakeDb({ akademie_aufnahmen: [aufnahmeZeile()], akademie_artikel: [] });
    const d = { ...deps(async () => entwurfJson()), transkribiere: async () => 'äh' };
    expect(await verarbeiteAufnahme(db.client, 'a1', d)).toBe('fehler');
    expect(db.tables.akademie_aufnahmen[0].fehler).toMatch(/nichts gesprochen/);
  });
});

describe('SOP aus Aufnahme: offene Fragen beantworten', () => {
  it('Antwort wird eingearbeitet, beantwortete Frage abgehakt, Rest bleibt offen', async () => {
    const db = createFakeDb({
      akademie_aufnahmen: [aufnahmeZeile({
        status: 'fertig',
        artikel_slug: 'sop-1',
        transkript: 'Transkript',
        offene_fragen: [{ frage: 'Ab welchem Budget Freigabe?', antwort: null }, { frage: 'Wer prüft Creatives?', antwort: null }],
      })],
      akademie_artikel: [{
        slug: 'sop-1', typ: 'sop', titel: 'Meta-Kampagne starten', modul: 'Setup', positionen: ['media_buyer'], step_keys: [], status: 'entwurf',
        zusammenfassung: 'alt', abschnitte: { schritte: ['Öffne den Ablauf'] }, inhalt: 'alt', ergaenzt_slug: null,
      }],
    });
    let prompt = '';
    const ki: KiBildFn = async (a) => {
      prompt = a.prompt;
      return entwurfJson({
        abschnitte: { zweck: 'x', ausloeser: 'y', automatisch: [], schritte: ['Öffne den Ablauf', 'Ab 50 € Tagesbudget: Felix freigeben lassen'], qualitaet: [], fehler: [], links: [] },
        offene_fragen: ['Wer prüft Creatives?'],
      });
    };
    const { offene_fragen } = await beantworteFragen(db.client, 'a1', '1. Ab 50 € Tagesbudget muss ich freigeben.', { ki });
    expect(prompt).toMatch(/Ab 50 €/);
    expect(offene_fragen).toEqual([
      { frage: 'Ab welchem Budget Freigabe?', antwort: '1. Ab 50 € Tagesbudget muss ich freigeben.' },
      { frage: 'Wer prüft Creatives?', antwort: null },
    ]);
    const art = db.tables.akademie_artikel[0];
    expect((art.abschnitte as { schritte: string[] }).schritte).toContain('Ab 50 € Tagesbudget: Felix freigeben lassen');
    expect(art.status).toBe('entwurf');
  });
});
