import { describe, it, expect } from 'vitest';
import {
  SCHWELLEN,
  berechneMarge,
  bewerberKontaktAktiv,
  bewerteAmpel,
  churnRisiko,
  einstellungsZeitpunkte,
  fenster,
  kennzahlen,
  keinLogin,
  kostenProEinstellung,
  liesZahl,
  median,
  upsellSignal,
  warnAufgaben,
  type Kennzahlen,
} from '../bewertung';
import { baueZeilen, type Rohdaten } from '../laden';

const jetzt = new Date('2026-10-15T12:00:00Z');
const tage = (n: number) => new Date(jetzt.getTime() - n * 864e5).toISOString();
const f30 = fenster(jetzt, 30);

const k = (extra: Partial<Kennzahlen> = {}): Kennzahlen => ({
  leads: 0, kontaktiert: 0, kontaktquote: null, ttfcMedianSek: null, termine: 0, erschienen: 0, noShows: 0,
  erscheinensquote: null, einstellungen: 0, anrufe: 0, ...extra,
});
const ok = { keineLogins: false, loginPruefen: true };

describe('kennzahlen', () => {
  it('zählt Leads, Kontakt (Erstkontakt oder Anruf), Median, Termine und Einstellungen im Fenster', () => {
    const r = kennzahlen(
      {
        kandidaten: [
          { id: 'a', created_at: tage(1), first_contact_at: tage(1), ttfc_seconds: 600 },
          { id: 'b', created_at: tage(2), first_contact_at: null, ttfc_seconds: null },
          { id: 'c', created_at: tage(3), first_contact_at: tage(2), ttfc_seconds: 7200 },
          { id: 'd', created_at: tage(4), first_contact_at: null, ttfc_seconds: null },
          { id: 'alt', created_at: tage(40), first_contact_at: null, ttfc_seconds: null },
        ],
        angerufen: new Set(['b']),
        termine: [
          { datum: tage(5), status: 'erschienen' },
          { datum: tage(6), status: 'no_show' },
          { datum: tage(7), status: 'done' },
          { datum: tage(8), status: 'abgesagt' },
          { datum: tage(45), status: 'erschienen' },
        ],
        einstellungen: [tage(3), tage(50)],
        anrufe: [tage(1), tage(2), tage(35)],
      },
      f30,
    );
    expect(r).toEqual({
      leads: 4, kontaktiert: 3, kontaktquote: 75, ttfcMedianSek: 3900, termine: 3, erschienen: 2, noShows: 1,
      erscheinensquote: 67, einstellungen: 1, anrufe: 2,
    });
  });

  it('median', () => {
    expect(median([])).toBeNull();
    expect(median([5, 1, 3])).toBe(3);
    expect(median([1, 2, 3, 10])).toBe(3);
  });
});

describe('bewerteAmpel', () => {
  it('grün ohne Auffälligkeiten', () => {
    expect(bewerteAmpel(k({ leads: 10, kontaktquote: 90, termine: 3 }), k(), ok)).toEqual({ ampel: 'gruen', gruende: [] });
  });
  it('rot bei Kontaktquote unter 50 %', () => {
    const r = bewerteAmpel(k({ leads: 10, kontaktquote: 40, termine: 2 }), k(), ok);
    expect(r.ampel).toBe('rot');
    expect(r.gruende[0]).toContain('40 %');
  });
  it('Kontaktquote erst ab Mindestzahl Leads', () => {
    expect(bewerteAmpel(k({ leads: SCHWELLEN.MIN_LEADS_QUOTE - 1, kontaktquote: 0 }), k(), ok).ampel).toBe('gruen');
  });
  it('rot ohne Logins, aber nicht in der Einrichtung', () => {
    expect(bewerteAmpel(k(), k(), { keineLogins: true, loginPruefen: true }).ampel).toBe('rot');
    expect(bewerteAmpel(k(), k(), { keineLogins: true, loginPruefen: false }).ampel).toBe('gruen');
  });
  it('rot bei > 20 Leads ohne Termin', () => {
    expect(bewerteAmpel(k({ leads: 21, kontaktquote: 90 }), k(), ok).ampel).toBe('rot');
    expect(bewerteAmpel(k({ leads: 20, kontaktquote: 90 }), k(), ok).ampel).toBe('gruen');
  });
  it('gelb bei Kontaktquote < 80 %, Erstkontakt > 24 h, Leads-Einbruch', () => {
    expect(bewerteAmpel(k({ leads: 10, kontaktquote: 70, termine: 1 }), k(), ok).ampel).toBe('gelb');
    expect(bewerteAmpel(k({ ttfcMedianSek: 25 * 3600 }), k(), ok).ampel).toBe('gelb');
    expect(bewerteAmpel(k({ leads: 4 }), k({ leads: 10 }), ok).ampel).toBe('gelb');
  });
  it('rot schlägt gelb, alle Gründe bleiben', () => {
    const r = bewerteAmpel(k({ leads: 10, kontaktquote: 70, ttfcMedianSek: 30 * 3600 }), k(), { keineLogins: true, loginPruefen: true });
    expect(r.ampel).toBe('rot');
    expect(r.gruende).toHaveLength(3);
  });
});

describe('churnRisiko', () => {
  const basis = { ampel: 'gruen' as const, ampelFrueher: 'gruen' as const, keineLogins: false, loginPruefen: true, jetzt: k({ leads: 10 }), vorher: k({ leads: 10 }) };
  it('kein Risiko', () => expect(churnRisiko(basis).risiko).toBe(false));
  it('seit 2 Wochen rot', () => {
    expect(churnRisiko({ ...basis, ampel: 'rot', ampelFrueher: 'rot' }).risiko).toBe(true);
    expect(churnRisiko({ ...basis, ampel: 'rot', ampelFrueher: 'gelb' }).risiko).toBe(false);
  });
  it('keine Logins / Leads eingebrochen', () => {
    expect(churnRisiko({ ...basis, keineLogins: true }).gruende).toEqual(['Kunde loggt sich nicht ein']);
    expect(churnRisiko({ ...basis, jetzt: k({ leads: 3 }) }).risiko).toBe(true);
  });
});

describe('upsellSignal', () => {
  const basis = { ampel: 'gruen' as const, jetzt: k({ leads: 10 }), vorher: k({ leads: 10 }), garantieErreicht: false, mitInnendienst: true };
  it('kein Signal ohne Anlass', () => expect(upsellSignal(basis).signal).toBe(false));
  it('Einstellungen ≥ Ziel → Masterclass Führungskräfte + weitere Stellen', () => {
    const r = upsellSignal({ ...basis, jetzt: k({ leads: 10, einstellungen: SCHWELLEN.UPSELL_EINSTELLUNGEN }) });
    expect(r.signal).toBe(true);
    expect(r.vorschlaege).toEqual(['Masterclass Führungskräfte', 'Weitere Stellen/Standorte']);
  });
  it('Leads stark gestiegen + gute Kontaktquote → mehr Budget; ohne Innendienst auch Innendienst', () => {
    const r = upsellSignal({ ...basis, jetzt: k({ leads: 15, kontaktquote: 85 }), mitInnendienst: false });
    expect(r.vorschlaege).toEqual(['Mehr Budget', 'Weitere Stellen/Standorte', 'Innendienst']);
  });
  it('gestiegen, aber Kontaktquote schlecht → kein Signal; rot → nie', () => {
    expect(upsellSignal({ ...basis, jetzt: k({ leads: 15, kontaktquote: 60 }) }).signal).toBe(false);
    expect(upsellSignal({ ...basis, ampel: 'rot', garantieErreicht: true }).signal).toBe(false);
  });
});

describe('Marge und Kosten', () => {
  it('MRR − Team − Kommunikation (ohne Indeed)', () => {
    const m = berechneMarge({ umsatz: 3000, teamMinuten: 600, stundensatz: 50, anrufMinuten: 200, vorlagen: 100 });
    expect(m).toEqual({ umsatz: 3000, teamKosten: 500, teamStunden: 10, kommKosten: 15, marge: 2485, margeProzent: 83 });
  });
  it('ohne Zeiterfassung oder Stundensatz: Teamkosten –', () => {
    expect(berechneMarge({ umsatz: 1000, teamMinuten: null, stundensatz: 50, anrufMinuten: 0, vorlagen: 0 }).teamKosten).toBeNull();
    expect(berechneMarge({ umsatz: 1000, teamMinuten: 60, stundensatz: null, anrufMinuten: 0, vorlagen: 0 }).marge).toBe(1000);
    expect(berechneMarge({ umsatz: null, teamMinuten: 60, stundensatz: 50, anrufMinuten: 0, vorlagen: 0 }).marge).toBeNull();
  });
  it('Kosten pro Einstellung', () => {
    expect(kostenProEinstellung(2000, 1000, 3)).toBe(1000);
    expect(kostenProEinstellung(2000, null, 0)).toBeNull();
    expect(kostenProEinstellung(null, null, 2)).toBeNull();
  });
});

describe('Einstellungen lesen', () => {
  it('Bewerber-Kontakt: aktiv für alle oder nur gelistete Kunden', () => {
    expect(bewerberKontaktAktiv('{"aktiv":true}', 'a')).toBe(true);
    expect(bewerberKontaktAktiv({ aktiv: true, kunden: ['b'] }, 'a')).toBe(true);
    expect(bewerberKontaktAktiv({ aktiv: false, kunden: ['a'] }, 'a')).toBe(true);
    expect(bewerberKontaktAktiv({ aktiv: false, kunden: ['b'] }, 'a')).toBe(false);
    expect(bewerberKontaktAktiv({ aktiv: true, kunden: ['a'] }, 'a')).toBe(true);
    expect(bewerberKontaktAktiv({ aktiv: false }, 'a')).toBe(false);
    expect(bewerberKontaktAktiv('kaputt', 'a')).toBe(false);
  });
  it('Stundensatz tolerant', () => {
    expect(liesZahl('65')).toBe(65);
    expect(liesZahl('65,5')).toBe(65.5);
    expect(liesZahl({ wert: 70 })).toBe(70);
    expect(liesZahl(null)).toBeNull();
    expect(liesZahl('abc')).toBeNull();
  });
  it('keinLogin', () => {
    expect(keinLogin(null, f30)).toBe(true);
    expect(keinLogin(tage(31), f30)).toBe(true);
    expect(keinLogin(tage(2), f30)).toBe(false);
  });
  it('Einstellungszeitpunkt: eingestellt_am, sonst Stufenwechsel, sonst Anlage bei aktueller Stufe', () => {
    const r = einstellungsZeitpunkte(
      [
        { id: '1', agency_id: 'a', eingestellt_am: tage(1), current_stage_id: null, created_at: tage(10) },
        { id: '2', agency_id: 'a', eingestellt_am: null, current_stage_id: 'h', created_at: tage(10) },
        { id: '3', agency_id: 'a', eingestellt_am: null, current_stage_id: 'h', created_at: tage(20) },
        { id: '4', agency_id: 'a', eingestellt_am: null, current_stage_id: 'x', created_at: tage(20) },
      ],
      [{ candidate_id: '2', changed_at: tage(5) }, { candidate_id: '2', changed_at: tage(3) }],
      new Set(['h']),
    );
    expect(r.map((x) => x.datum)).toEqual([tage(1), tage(3), tage(20)]);
  });
});

describe('warnAufgaben', () => {
  const z = (id: string, extra: Record<string, unknown> = {}) => ({
    id, name: id.toUpperCase(), csm_user_id: 'csm', pausiert: false, ampel: 'rot' as const, gruende: ['Grund'],
    churn: { risiko: true, gruende: ['Churn-Grund'] }, ...extra,
  });
  it('eine Aufgabe je Kunde und Grund, offene werden nicht doppelt angelegt, pausierte nie', () => {
    const r = warnAufgaben([z('a'), z('b'), z('c', { pausiert: true })], ['kz:a:rot:2026-10-10'], '2026-10-15');
    expect(r.map((x) => x.quelle_ref)).toEqual(['kz:a:churn:2026-10-15', 'kz:b:rot:2026-10-15', 'kz:b:churn:2026-10-15']);
    expect(r[1].assigned_to).toBe('csm');
  });
  it('grün ohne Churn → nichts', () => {
    expect(warnAufgaben([z('a', { ampel: 'gruen', churn: { risiko: false, gruende: [] } })], [], '2026-10-15')).toEqual([]);
  });
});

describe('baueZeilen', () => {
  const roh = (extra: Partial<Rohdaten> = {}): Rohdaten => ({
    kunden: [
      { id: 'a', name: 'A', settings: null, fulfillment_phase: 'continuity', pausiert_grund: null, csm_user_id: null, mrr: null, werbebudget: '1000', paket: 'Starter', bausteine: null, garantie_ist: null, garantie_ziel_starter: null },
      { id: 'b', name: 'B', settings: null, fulfillment_phase: 'continuity', pausiert_grund: null, csm_user_id: null, mrr: '2500', werbebudget: null, paket: null, bausteine: null, garantie_ist: 3, garantie_ziel_starter: 3 },
    ],
    retainer: new Map([['starter', 2000]]),
    kandidaten: [
      // A: 10 Leads jetzt (keiner kontaktiert), 10 auch vor 14–44 Tagen ohne Kontakt → seit 2 Wochen rot
      ...Array.from({ length: 10 }, (_, i) => ({ id: `a${i}`, agency_id: 'a', created_at: tage(i + 1), first_contact_at: null, ttfc_seconds: null })),
      ...Array.from({ length: 10 }, (_, i) => ({ id: `a-alt${i}`, agency_id: 'a', created_at: tage(20 + i), first_contact_at: null, ttfc_seconds: null })),
      ...Array.from({ length: 6 }, (_, i) => ({ id: `b${i}`, agency_id: 'b', created_at: tage(i + 1), first_contact_at: tage(i), ttfc_seconds: 300 })),
    ],
    anrufe: [],
    termine: [{ agency_id: 'a', datum: tage(2), status: 'geplant' }],
    einstellungen: [{ agency_id: 'b', datum: tage(4) }],
    nutzer: [
      { agency_id: 'a', last_login: tage(1) },
      { agency_id: 'b', last_login: tage(2) },
      { agency_id: 'b', last_login: tage(60) },
    ],
    whatsapp: new Set(['b']),
    kontaktSchalter: { aktiv: false, kunden: ['b'] },
    stundensatz: 60,
    teamMinuten: new Map([['b', 120]]),
    anrufMinuten: new Map([['b', 100]]),
    vorlagen: new Map([['b', 20]]),
    ...extra,
  });

  it('rot zuerst, Churn „seit 2 Wochen rot“, MRR aus Paket, Upsell bei erreichter Garantie', () => {
    const [a, b] = baueZeilen(roh(), jetzt);
    expect(a.id).toBe('a');
    expect(a.ampel).toBe('rot');
    expect(a.churn.gruende).toContain('Seit mindestens 14 Tagen rot');
    expect(a.marge.umsatz).toBe(2000);
    expect(a.marge.teamKosten).toBe(0);
    expect(a.nutzung).toMatchObject({ kundenNutzer: 1, aktiveNutzer: 1, whatsappVerbunden: false, bewerberKontaktAktiv: false });

    expect(b.ampel).toBe('gruen');
    expect(b.upsell.signal).toBe(true);
    expect(b.kostenProEinstellung).toBe(2500);
    expect(b.nutzung).toMatchObject({ kundenNutzer: 2, aktiveNutzer: 1, whatsappVerbunden: true, bewerberKontaktAktiv: true });
    expect(b.marge).toMatchObject({ umsatz: 2500, teamKosten: 120, kommKosten: 6, marge: 2374 });
  });

  it('€/Einstellung mit echten Meta-Ausgaben statt Werbebudget, Indeed nur als Info', () => {
    const [a, b] = baueZeilen(roh({ metaAusgaben: new Map([['b', 500]]), indeedKosten: new Map([['b', 300]]) }), jetzt);
    expect(b.kostenProEinstellung).toBe(3000);
    expect(b.metaAusgaben).toBe(500);
    expect(b.indeedKosten).toBe(300);
    expect(b.marge.umsatz).toBe(2500);
    expect(a.metaAusgaben).toBeNull();
  });

  it('ohne Zeiterfassung: Teamkosten –', () => {
    const [, b] = baueZeilen(roh({ teamMinuten: null }), jetzt);
    expect(b.marge.teamKosten).toBeNull();
    expect(b.marge.marge).toBe(2494);
  });
});
