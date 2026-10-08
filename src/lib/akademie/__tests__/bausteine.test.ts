import { beforeEach, describe, expect, it } from 'vitest';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';
import { START_ARTIKEL, VIDEOS } from '../inhalte';
import { POSITIONEN } from '../positionen';
import { LERNPFADE, STUFEN, lernpfadFuer, fortschrittVon } from '../lernpfade';
import { WISSENSCHECKS, fragenOhneLoesung, werteAus } from '../wissenscheck';
import { checklisteVon, offenePunkte, reviewVon } from '../bausteine';
import { PFAD_SOP, hilfeSlugs, pfadMuster, sopsFuerPfad, vorgangVon } from '../hilfe-zuordnung';
import { aktualisiereStartInhalte, setzeStartInhaltePruefungZurueck, START_QUELLE, zeileAusDef, type Artikel } from '../daten';
import { hilfeFuer, ladeHilfeModus, offeneCheckliste, speichereCheckliste, speichereReview } from '../checklisten';
import { berechneZugriff } from '../zugriff';

const slugs = new Set(START_ARTIKEL.map((a) => a.slug));
const setter = { id: 'u-setter', role: 'employee', funktion: 'setter' };
const innendienst = { id: 'u-id', role: 'employee', funktion: 'innendienst' };
const admin = { id: 'u-admin', role: 'admin', funktion: 'csm' };

beforeEach(() => setzeStartInhaltePruefungZurueck());

describe('Akademie A–Z: Inhalte', () => {
  it('jedes Thema hat Checkliste und Review-Checkliste (Bausteine 3 und 4)', () => {
    const ohne = START_ARTIKEL.filter((a) => !a.abschnitte?.checkliste?.length || !a.abschnitte?.review?.length).map((a) => a.slug);
    expect(ohne).toEqual([]);
  });

  it('Slugs und Video-Keys sind eindeutig', () => {
    expect(slugs.size).toBe(START_ARTIKEL.length);
    expect(new Set(VIDEOS.map((v) => v.key)).size).toBe(VIDEOS.length);
  });

  it('Qualität und Fehler einer SOP landen in der Review-Checkliste', () => {
    const r = reviewVon({ typ: 'sop', abschnitte: { qualitaet: ['Preise stimmen'], fehler: ['Falsches Paket.'] } });
    expect(r).toEqual(['Preise stimmen', 'Vermieden: Falsches Paket']);
    expect(checklisteVon({ typ: 'sop', abschnitte: { schritte: ['A', 'B'] } })).toEqual(['A', 'B']);
    expect(offenePunkte(['A', 'B', 'C'], [0, 2])).toEqual(['B']);
  });

  it('Neue Inhalte starten als Entwurf, Platzhalter sind als „Felix ergänzt“ markiert', () => {
    for (const s of ['willkommen', 'innendienst-anruf', 'creatives-erstellen', 'videos-schneiden', 'arbeitsplatz-verlassen']) {
      expect(START_ARTIKEL.find((a) => a.slug === s)?.status).toBe('entwurf');
    }
    expect(START_ARTIKEL.find((a) => a.slug === 'skript-innendienst-bewerber')?.inhalt).toContain('Felix ergänzt');
  });
});

describe('Akademie A–Z: Bereichs-Akademien', () => {
  it('jede Position hat einen Lernpfad mit existierenden Artikeln und Tag 1', () => {
    for (const p of POSITIONEN) {
      const pfad = LERNPFADE[p.id];
      expect(pfad, p.id).toBeTruthy();
      expect(pfad['Tag 1'].length, p.id).toBeGreaterThan(0);
      for (const st of STUFEN) for (const s of pfad[st]) expect(slugs.has(s), `${p.id}: ${s}`).toBe(true);
    }
  });

  it('Lernpfad zeigt nur Sichtbares, Rest der Position unter „weiteres“', () => {
    const sichtbar = START_ARTIKEL.filter((a) => a.positionen.includes('innendienst')).map((a) => ({ slug: a.slug, titel: a.titel, typ: a.typ, positionen: a.positionen }));
    const { stufen, weiteres } = lernpfadFuer('innendienst', sichtbar);
    expect(stufen[0].artikel.map((a) => a.slug)).toContain('innendienst-anruf');
    expect(stufen.flatMap((s) => s.artikel).some((a) => a.slug === 'cloud-rundgang')).toBe(false);
    expect(weiteres.every((a) => a.positionen.includes('innendienst'))).toBe(true);
    expect(fortschrittVon(['a', 'b'], { a: { gelesen: true } })).toEqual({ gelesen: 1, gesamt: 2, prozent: 50 });
  });

  it('jede Position hat einen Wissenscheck mit 3–6 gültigen Fragen; Auswertung ab 80 %', () => {
    for (const p of POSITIONEN) {
      const f = WISSENSCHECKS[p.id];
      expect(f?.length, p.id).toBeGreaterThanOrEqual(3);
      expect(f.length, p.id).toBeLessThanOrEqual(6);
      for (const q of f) expect(q.richtig).toBeLessThan(q.optionen.length);
    }
    expect(fragenOhneLoesung('setting')[0]).not.toHaveProperty('richtig');
    const alleRichtig = Object.fromEntries(WISSENSCHECKS.setting.map((q) => [q.id, q.richtig]));
    expect(werteAus('setting', alleRichtig).bestanden).toBe(true);
    expect(werteAus('setting', { ...alleRichtig, s1: 99 }).bestanden).toBe(false);
  });
});

describe('Hilfe-Modus: Zuordnung', () => {
  it('Pfade und Ablauf-Schritte zeigen auf existierende SOPs', () => {
    for (const e of PFAD_SOP) for (const s of e.slugs) expect(slugs.has(s), s).toBe(true);
    expect(sopsFuerPfad('/inbox')).toContain('whatsapp-inbox');
    expect(sopsFuerPfad('/clients/123e4567-e89b-12d3-a456-426614174000/ablauf')[0]).toBe('kunden-ablauf');
    expect(sopsFuerPfad('/irgendwas')).toEqual([]);
    expect(hilfeSlugs({ pfad: '/meine-todos', stepKey: 's_funnel' })[0]).toBe('funnel');
    expect(hilfeSlugs({ pfad: '/clients/x/ablauf', stepKey: 'o_kickoff' })).toEqual(['kickoff', 'kunden-ablauf', 'meine-aufgaben']);
  });

  it('Vorgang bindet die Checkliste an Aufgabe bzw. Seite inkl. Kunde', () => {
    expect(vorgangVon({ stepId: 'abc' })).toBe('step:abc');
    expect(vorgangVon({ pfad: '/clients/k1/ablauf' })).toBe('pfad:/clients/k1/ablauf');
    expect(pfadMuster('/clients/123e4567-e89b-12d3-a456-426614174000/ablauf')).toBe('/clients/[id]/ablauf');
  });
});

describe('Checkliste, Review, Hilfe (mit Fake-DB)', () => {
  const freigegeben = (slug: string) => ({ ...zeileAusDef(START_ARTIKEL.find((a) => a.slug === slug)!), status: 'freigegeben' });
  const art = (db: ReturnType<typeof createFakeDb>, slug: string) => db.tables.akademie_artikel.find((a) => a.slug === slug) as unknown as Artikel;

  it('Checkliste startet je Vorgang neu und meldet „komplett“', async () => {
    const db = createFakeDb({ akademie_artikel: [freigegeben('innendienst-anruf')] });
    const a = art(db, 'innendienst-anruf');
    const n = checklisteVon(a).length;
    const r1 = await speichereCheckliste(db.client, 'u-id', a, 'step:1', [0, 1, 99]);
    expect(r1.erledigt).toEqual([0, 1]);
    expect(r1.komplett).toBe(false);
    const r2 = await speichereCheckliste(db.client, 'u-id', a, 'step:2', Array.from({ length: n }, (_, i) => i));
    expect(r2.komplett).toBe(true);
    expect(db.tables.akademie_checklisten).toHaveLength(2);
  });

  it('Hinweis beim Erledigen: offene Punkte der Checkliste dieser Aufgabe', async () => {
    const db = createFakeDb({ akademie_artikel: [freigegeben('funnel')] });
    const z = berechneZugriff(admin, [], []);
    const a = art(db, 'funnel');
    await speichereCheckliste(db.client, 'u-admin', a, 'step:7', [0]);
    const r = await offeneCheckliste(db.client, z, 'u-admin', 'funnel', 'step:7');
    expect(r?.offen).toEqual(checklisteVon(a).slice(1));
    const anderer = await offeneCheckliste(db.client, z, 'u-admin', 'funnel', 'step:8');
    expect(anderer?.offen).toHaveLength(checklisteVon(a).length);
  });

  it('Review: Selbstcheck, dann zur Prüfung', async () => {
    const db = createFakeDb({ akademie_artikel: [freigegeben('innendienst-anruf')] });
    const a = art(db, 'innendienst-anruf');
    await speichereReview(db.client, 'u-id', a, 'step:1', { erledigt: [0] });
    expect(db.tables.akademie_reviews[0].status).toBe('selbstcheck');
    await speichereReview(db.client, 'u-id', a, 'step:1', { erledigt: [0, 1], zurPruefung: true });
    expect(db.tables.akademie_reviews).toHaveLength(1);
    expect(db.tables.akademie_reviews[0].status).toBe('zur_pruefung');
  });

  it('Hilfe respektiert die Freischaltung und meldet sonst eine Wissenslücke', async () => {
    const db = createFakeDb({ akademie_artikel: [freigegeben('innendienst-anruf'), freigegeben('whatsapp-inbox'), freigegeben('kundenkommunikation')] });
    const id = await hilfeFuer(db.client, berechneZugriff(innendienst, [], []), 'u-id', { pfad: '/dialer', kontext: 'pfad:/dialer' });
    expect(id.themen.map((t) => t.slug)).toContain('innendienst-anruf');
    // Setter sieht Innendienst-SOPs nicht
    const s = await hilfeFuer(db.client, berechneZugriff(setter, [], []), 'u-setter', { pfad: '/candidates', kontext: 'x', meldeLuecke: true });
    expect(s.keineAnleitung).toBe(true);
    expect(db.tables.akademie_luecken).toHaveLength(1);
    // ohne meldeLuecke keine weitere Lücke
    await hilfeFuer(db.client, berechneZugriff(setter, [], []), 'u-setter', { pfad: '/funnels', kontext: 'x' });
    expect(db.tables.akademie_luecken).toHaveLength(1);
  });

  it('Hilfe-Modus: Standard an für Mitarbeiter, aus für Admins', async () => {
    const db = createFakeDb();
    expect(await ladeHilfeModus(db.client, 'u-id', false)).toBe(true);
    expect(await ladeHilfeModus(db.client, 'u-admin', true)).toBe(false);
  });
});

describe('Seed-Aktualisierung', () => {
  it('unbearbeitete Start-Artikel werden aktualisiert, bearbeitete bekommen nur Checkliste/Review', async () => {
    const alt = (slug: string) => {
      const z = zeileAusDef(START_ARTIKEL.find((a) => a.slug === slug)!);
      const ab = { ...z.abschnitte };
      delete ab.checkliste;
      delete ab.review;
      return { ...z, abschnitte: ab, zusammenfassung: 'alt', status: 'freigegeben' };
    };
    const db = createFakeDb({
      akademie_artikel: [
        { ...alt('after-close'), quelle: START_QUELLE, bearbeitet_am: null },
        { ...alt('kickoff'), quelle: START_QUELLE, bearbeitet_am: '2026-10-01', zusammenfassung: 'Von Felix bearbeitet' },
      ],
    });
    const r = await aktualisiereStartInhalte(db.client);
    expect(r).toEqual({ aktualisiert: 1, ergaenzt: 1 });
    const ac = db.tables.akademie_artikel.find((a) => a.slug === 'after-close')!;
    expect(ac.zusammenfassung).not.toBe('alt');
    expect(ac.status).toBe('freigegeben');
    const ko = db.tables.akademie_artikel.find((a) => a.slug === 'kickoff')!;
    expect(ko.zusammenfassung).toBe('Von Felix bearbeitet');
    expect((ko.abschnitte as { review?: string[] }).review?.length).toBeGreaterThan(0);
  });
});
