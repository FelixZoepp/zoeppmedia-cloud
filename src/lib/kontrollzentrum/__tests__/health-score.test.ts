import { describe, it, expect } from 'vitest';
import {
  HEALTH_GEWICHTE,
  berechneHealthScore,
  healthKennzahlen,
  healthStufe,
  liesSollWoche,
  mitSnapshots,
  tageVor,
  type HealthAnzeige,
  type HealthEingabe,
  type HealthKennzahlen,
  type HealthSnapshot,
} from '../health-score';
import { baueZeilen, type Rohdaten } from '../laden';

const jetzt = new Date('2026-11-01T12:00:00Z');
const tage = (n: number) => new Date(jetzt.getTime() - n * 864e5).toISOString();
const stunden = (n: number) => new Date(jetzt.getTime() - n * 36e5).toISOString();

/** Gesunder Kunde in laufender Kampagne */
const gesund = (extra: Partial<HealthKennzahlen> = {}): HealthKennzahlen => ({
  phase: 'continuity',
  phaseSeitTagen: 90,
  leads7: 10,
  leads30: 40,
  sollWoche: null,
  basis48h: 20,
  ohneAnruf48h: 0,
  ttfcMedianSek: 1800,
  leadsErstkontakt: 40,
  kundenNutzer: 2,
  tageSeitLogin: 1,
  loginPruefen: true,
  termineOhneErgebnis: 0,
  probetagHaengt: 0,
  einstellungen30: 2,
  pruefstandOffen: 0,
  offeneEinladungen: 0,
  ...extra,
});

const bereiche = (k: HealthKennzahlen) => berechneHealthScore(k).gruende.map((g) => g.bereich);

describe('berechneHealthScore', () => {
  it('Gewichte summieren sich auf 100', () => {
    expect(Object.values(HEALTH_GEWICHTE).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('gesunder Kunde → 100, gut, keine Gründe', () => {
    expect(berechneHealthScore(gesund())).toEqual({ score: 100, stufe: 'gut', gruende: [] });
  });

  it('Stufen-Grenzen', () => {
    expect(healthStufe(80)).toBe('gut');
    expect(healthStufe(79)).toBe('beobachten');
    expect(healthStufe(60)).toBe('beobachten');
    expect(healthStufe(59)).toBe('kritisch');
  });

  describe('Zufluss', () => {
    it('gegen eigenen 30-Tage-Schnitt: unter 50 % → 70 % Abzug', () => {
      // Schnitt 40/30*7 = 9,3 → 4 sind < 50 %
      const r = berechneHealthScore(gesund({ leads7: 4 }));
      expect(r.gruende).toEqual([{ bereich: 'zufluss', abzug: 14, text: 'Nur 4 Bewerber in 7 Tagen (Schnitt 9,3/Woche)' }]);
      expect(r.score).toBe(86);
    });

    it('zwischen 50 und 80 % → 40 % Abzug', () => {
      expect(berechneHealthScore(gesund({ leads7: 6 })).gruende[0]).toMatchObject({ bereich: 'zufluss', abzug: 8 });
    });

    it('Soll aus Einstellungen hat Vorrang vor dem Schnitt', () => {
      const r = berechneHealthScore(gesund({ leads7: 10, sollWoche: 25 }));
      expect(r.gruende[0]).toMatchObject({ bereich: 'zufluss', abzug: 14 });
      expect(r.gruende[0].text).toContain('Soll 25');
    });

    it('keine Bewerber in 30 Tagen → volles Gewicht (und keine Einstellung)', () => {
      const r = berechneHealthScore(gesund({ leads7: 0, leads30: 0, einstellungen30: 0, basis48h: 0, ttfcMedianSek: null, leadsErstkontakt: 0 }));
      expect(r.gruende.map((g) => [g.bereich, g.abzug])).toEqual([
        ['zufluss', 20],
        ['einstellungen', 15],
      ]);
      expect(r.score).toBe(65);
      expect(r.stufe).toBe('beobachten');
    });

    it('Onboarding/Zahlung/Setup: kein Abzug für fehlenden Zufluss und fehlende Einstellungen', () => {
      for (const phase of ['onboarding', 'zahlung', 'setup']) {
        const r = berechneHealthScore(
          gesund({ phase, phaseSeitTagen: 2, leads7: 0, leads30: 0, einstellungen30: 0, basis48h: 0, ttfcMedianSek: null, leadsErstkontakt: 0 }),
        );
        expect(r.score).toBe(100);
      }
    });
  });

  it('48 Std. ohne Anrufversuch: Anteil > 50 % → volles Gewicht, unter Mindestbasis nichts', () => {
    const r = berechneHealthScore(gesund({ basis48h: 10, ohneAnruf48h: 6 }));
    expect(r.gruende).toEqual([{ bereich: 'anruf48h', abzug: 15, text: '6 von 10 Bewerbern (60 %) seit über 48 Std. ohne Anrufversuch' }]);
    expect(berechneHealthScore(gesund({ basis48h: 10, ohneAnruf48h: 3 })).gruende[0].abzug).toBe(10.5);
    expect(berechneHealthScore(gesund({ basis48h: 10, ohneAnruf48h: 1 })).gruende).toEqual([]);
    expect(bereiche(gesund({ basis48h: 2, ohneAnruf48h: 2 }))).toEqual([]);
  });

  it('Median Erstkontakt: Stufen nach Stunden', () => {
    expect(berechneHealthScore(gesund({ ttfcMedianSek: 3 * 3600 })).gruende[0]).toMatchObject({ bereich: 'erstkontakt', abzug: 2.5, text: 'Erstkontakt dauert im Median 3 Std.' });
    expect(berechneHealthScore(gesund({ ttfcMedianSek: 30 * 3600 })).gruende[0].abzug).toBe(7.5);
    expect(berechneHealthScore(gesund({ ttfcMedianSek: 72 * 3600 })).gruende[0].abzug).toBe(10);
    expect(bereiche(gesund({ ttfcMedianSek: 72 * 3600, leadsErstkontakt: 2 }))).toEqual([]);
  });

  it('Login: nie bzw. > 30 Tage → volles Gewicht; nicht prüfen in Einrichtung', () => {
    expect(berechneHealthScore(gesund({ tageSeitLogin: null })).gruende[0]).toMatchObject({ bereich: 'login', abzug: 10, text: 'Kunde hat sich noch nie eingeloggt' });
    expect(berechneHealthScore(gesund({ tageSeitLogin: 20 })).gruende[0].abzug).toBe(6);
    expect(berechneHealthScore(gesund({ tageSeitLogin: 10 })).gruende[0].abzug).toBe(3);
    expect(bereiche(gesund({ tageSeitLogin: null, loginPruefen: false }))).toEqual([]);
  });

  it('Termine ohne Ergebnis und Probetag-Stau zählen zusammen', () => {
    const r = berechneHealthScore(gesund({ termineOhneErgebnis: 1, probetagHaengt: 1 }));
    expect(r.gruende).toEqual([{ bereich: 'termine', abzug: 6, text: '1 vergangener Termin ohne Ergebnis, 1 Bewerber seit über 3 Tagen in Probetag' }]);
    expect(berechneHealthScore(gesund({ termineOhneErgebnis: 4 })).gruende[0].abzug).toBe(10);
  });

  it('Einstellungen: erst nach 30 Tagen Laufzeit bewertet', () => {
    expect(berechneHealthScore(gesund({ einstellungen30: 0 })).gruende).toEqual([{ bereich: 'einstellungen', abzug: 15, text: 'Keine Einstellung in 30 Tagen' }]);
    expect(bereiche(gesund({ einstellungen30: 0, phaseSeitTagen: 10 }))).toEqual([]);
  });

  it('Prüfstand-Fälle', () => {
    expect(berechneHealthScore(gesund({ pruefstandOffen: 1 })).gruende).toEqual([{ bereich: 'pruefstand', abzug: 2, text: '1 Bewerber wartet im Prüfstand auf Freigabe' }]);
    expect(berechneHealthScore(gesund({ pruefstandOffen: 8 })).gruende[0].abzug).toBe(5);
  });

  it('Onboarding hängt: kein User, offene Einladung, Phase > 7 Tage (gedeckelt)', () => {
    const r = berechneHealthScore(
      gesund({ phase: 'onboarding', phaseSeitTagen: 12, kundenNutzer: 0, offeneEinladungen: 1, leads7: 0, leads30: 0, basis48h: 0, einstellungen30: 0 }),
    );
    expect(r.gruende).toEqual([
      { bereich: 'onboarding', abzug: 15, text: 'Onboarding hängt: kein Kunden-User angelegt, 1 Einladung nicht angenommen, seit 12 Tagen in Phase Onboarding' },
    ]);
    expect(r.score).toBe(85);
    // In der Phase Zahlung gibt es noch keinen User – das allein ist kein Problem
    expect(bereiche(gesund({ phase: 'zahlung', phaseSeitTagen: 3, kundenNutzer: 0, leads7: 0, leads30: 0, einstellungen30: 0 }))).toEqual([]);
  });

  it('Gründe nach Abzug sortiert, Score nie unter 0, kritisch', () => {
    const r = berechneHealthScore(
      gesund({
        leads7: 0,
        basis48h: 10,
        ohneAnruf48h: 10,
        ttfcMedianSek: 100 * 3600,
        tageSeitLogin: null,
        termineOhneErgebnis: 5,
        einstellungen30: 0,
        pruefstandOffen: 10,
        offeneEinladungen: 2,
      }),
    );
    expect(r.gruende.map((g) => g.abzug)).toEqual([20, 15, 15, 10, 10, 10, 5, 4.5]);
    expect(r.score).toBe(11);
    expect(r.stufe).toBe('kritisch');
  });
});

describe('healthKennzahlen', () => {
  const eingabe = (extra: Partial<HealthEingabe> = {}): HealthEingabe => ({
    phase: 'continuity',
    phaseSeit: tage(45),
    settings: { bewerber_soll_woche: '12' },
    kandidaten: [
      { id: 'neu', created_at: stunden(10), first_dial_at: null },
      { id: 'gewaehlt', created_at: tage(3), first_dial_at: tage(3) },
      { id: 'log', created_at: tage(4), first_dial_at: null },
      { id: 'offen', created_at: tage(5), first_dial_at: null },
      { id: 'abgesagt', created_at: tage(6), first_dial_at: null, current_stage_id: 'st-abgesagt' },
      { id: 'alt', created_at: tage(40), first_dial_at: null },
    ],
    angerufen: new Set(['log']),
    abgeschlossen: new Set(['st-abgesagt']),
    ttfcMedianSek: 7200,
    leads30: 5,
    kundenNutzer: 1,
    letzterLogin: tage(9),
    loginPruefen: true,
    offeneTermine: [tage(2), stunden(1)],
    probetagSeit: [tage(5), tage(1)],
    einstellungen30: 0,
    pruefstandOffen: 2,
    einladungen: [tage(5), tage(1)],
    ...extra,
  });

  it('leitet alle Kennzahlen aus den Rohdaten ab', () => {
    expect(healthKennzahlen(eingabe(), jetzt)).toEqual({
      phase: 'continuity',
      phaseSeitTagen: 45,
      leads7: 5,
      leads30: 5,
      sollWoche: 12,
      // fällig: gewaehlt, log, offen (neu < 48 Std., abgesagt abgeschlossen, alt > 30 Tage)
      basis48h: 3,
      ohneAnruf48h: 1,
      ttfcMedianSek: 7200,
      leadsErstkontakt: 5,
      kundenNutzer: 1,
      tageSeitLogin: 9,
      loginPruefen: true,
      termineOhneErgebnis: 2,
      probetagHaengt: 1,
      einstellungen30: 0,
      pruefstandOffen: 2,
      offeneEinladungen: 1,
    });
  });

  it('nie eingeloggt / Phase ohne Datum → null', () => {
    const k = healthKennzahlen(eingabe({ letzterLogin: null, phaseSeit: null }), jetzt);
    expect(k.tageSeitLogin).toBeNull();
    expect(k.phaseSeitTagen).toBeNull();
  });

  it('liesSollWoche', () => {
    expect(liesSollWoche({ bewerber_soll_woche: 15 })).toBe(15);
    expect(liesSollWoche({ bewerber_soll_woche: '7,5' })).toBe(7.5);
    expect(liesSollWoche({ bewerber_soll_woche: 0 })).toBeNull();
    expect(liesSollWoche(null)).toBeNull();
  });
});

describe('mitSnapshots', () => {
  const live = (score: number): HealthAnzeige => ({ score, stufe: healthStufe(score), gruende: [], kennzahlen: gesund(), vor7: null, trend: null, quelle: 'live' });
  const snap = (agency_id: string, datum: string, score: number): HealthSnapshot => ({ agency_id, datum, score, stufe: healthStufe(score), gruende: [], kennzahlen: gesund() });

  it('Snapshot von heute gilt, sonst live; Trend gegen jüngsten Snapshot ≥ 7 Tage alt', () => {
    const heute = '2026-11-01';
    expect(tageVor(heute, 7)).toBe('2026-10-25');
    const [a, b, c] = mitSnapshots(
      [
        { id: 'a', health: live(90) },
        { id: 'b', health: live(50) },
        { id: 'c', health: null },
      ],
      [snap('a', heute, 70), snap('a', '2026-10-25', 80), snap('a', '2026-10-23', 99), snap('a', '2026-10-28', 10), snap('b', '2026-10-20', 40), snap('c', heute, 5)],
      heute,
    );
    expect(a.health).toMatchObject({ score: 70, quelle: 'snapshot', vor7: 80, trend: -10 });
    // b: Snapshot älter als 10 Tage zählt nicht
    expect(b.health).toMatchObject({ score: 50, quelle: 'live', vor7: null, trend: null });
    expect(c.health).toBeNull();
  });
});

describe('baueZeilen mit Health', () => {
  const roh = (extra: Partial<Rohdaten> = {}): Rohdaten => ({
    kunden: [
      { id: 'a', name: 'A', settings: null, fulfillment_phase: 'continuity', fulfillment_phase_seit: tage(60), pausiert_grund: null, csm_user_id: null, mrr: '2000', werbebudget: null, paket: null, bausteine: null, garantie_ist: null, garantie_ziel_starter: null },
      { id: 'p', name: 'P', settings: null, fulfillment_phase: 'continuity', pausiert_grund: 'Urlaub', csm_user_id: null, mrr: null, werbebudget: null, paket: null, bausteine: null, garantie_ist: null, garantie_ziel_starter: null },
      { id: 'o', name: 'O', settings: null, fulfillment_phase: 'onboarding', fulfillment_phase_seit: tage(2), pausiert_grund: null, csm_user_id: null, mrr: null, werbebudget: null, paket: null, bausteine: null, garantie_ist: null, garantie_ziel_starter: null },
    ],
    retainer: new Map(),
    kandidaten: Array.from({ length: 6 }, (_, i) => ({ id: `a${i}`, agency_id: 'a', created_at: tage(i + 3), first_contact_at: null, ttfc_seconds: null, first_dial_at: null })),
    anrufe: [],
    termine: [],
    einstellungen: [],
    nutzer: [
      { agency_id: 'a', last_login: tage(1) },
      { agency_id: 'o', last_login: tage(1) },
    ],
    whatsapp: new Set(),
    kontaktSchalter: null,
    stundensatz: null,
    teamMinuten: null,
    anrufMinuten: new Map(),
    vorlagen: new Map(),
    health: { offeneTermine: [{ agency_id: 'a', datum: tage(2) }], probetag: [], pruefstand: new Map([['a', 1]]), einladungen: [], abgeschlossen: new Set() },
    ...extra,
  });

  it('nutzt dieselben Daten wie die Ampel; pausiert → kein Score; Onboarding ohne Zufluss-Abzug', () => {
    const zeilen = baueZeilen(roh(), jetzt);
    const a = zeilen.find((z) => z.id === 'a')!;
    expect(a.health?.quelle).toBe('live');
    expect(a.health?.kennzahlen).toMatchObject({ basis48h: 6, ohneAnruf48h: 6, termineOhneErgebnis: 1, pruefstandOffen: 1, tageSeitLogin: 1 });
    expect(a.health?.gruende.map((g) => g.bereich)).toEqual(['anruf48h', 'einstellungen', 'termine', 'pruefstand']);
    expect(a.health?.score).toBe(100 - 15 - 15 - 3 - 2);
    expect(zeilen.find((z) => z.id === 'p')!.health).toBeNull();
    expect(zeilen.find((z) => z.id === 'o')!.health).toMatchObject({ score: 100, stufe: 'gut' });
  });

  it('ohne Health-Zusatzdaten (ältere Aufrufer) trotzdem berechenbar', () => {
    const a = baueZeilen(roh({ health: undefined }), jetzt).find((z) => z.id === 'a')!;
    expect(a.health?.kennzahlen.termineOhneErgebnis).toBe(0);
  });
});
