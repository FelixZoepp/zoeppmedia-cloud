import { describe, expect, it } from 'vitest';
import { berechneUmsatz, klassifiziere, mrr, quellenKategorie, umsatzart, zeitraumFuer, type Kunde, type Rechnung } from '../berechnung';

const kunde = (p: Partial<Kunde> = {}): Kunde => ({
  id: 'k1', name: 'Turhan Vertriebs GmbH', lex_contact_id: 'c1', vertragsstart: '2026-03-01', mrr: 2000, setup_betrag: 3000,
  paket: 'Recruiting Pro', fulfillment_phase: 'continuity', laufzeit_monate: 6, ...p,
});
const rechnung = (p: Partial<Rechnung> = {}): Rechnung => ({
  id: Math.random().toString(36).slice(2), nummer: null, datum: '2026-03-02', status: 'paid', brutto: 3570, netto: 3000,
  contactId: 'c1', contactName: 'Turhan Vertriebs GmbH', positionen: [], ...p,
});

describe('umsatzart', () => {
  it('nimmt den Typ aus der Rechnungsliste der Cloud', () => {
    expect(umsatzart(rechnung({ netto: 999 }), kunde(), 'retainer')).toBe('retainer');
  });
  it('erkennt Positionstexte', () => {
    expect(umsatzart(rechnung({ positionen: ['Einrichtungsgebühr Recruiting'] }), null, null)).toBe('setup');
    expect(umsatzart(rechnung({ positionen: ['Zusätzliche Region Köln'] }), null, null)).toBe('upsell');
    expect(umsatzart(rechnung({ positionen: ['Monatliche Betreuung Oktober'] }), null, null)).toBe('retainer');
  });
  it('fällt auf Vertragsbeträge zurück', () => {
    expect(umsatzart(rechnung({ netto: 3000 }), kunde(), null)).toBe('setup');
    expect(umsatzart(rechnung({ netto: 2000 }), kunde(), null)).toBe('retainer');
    expect(umsatzart(rechnung({ netto: 77 }), kunde(), null)).toBe('sonstiges');
  });
});

describe('klassifiziere – Neukunde / Bestand / Upsell', () => {
  it('Neukunde in den ersten 30 Tagen, danach Bestand, höherer Monatsbetrag = Upsell', () => {
    const z = klassifiziere({
      kunden: [kunde()],
      fakturiert: [],
      abschluesse: [],
      rechnungen: [
        rechnung({ datum: '2026-03-02', netto: 3000 }),
        rechnung({ datum: '2026-03-20', netto: 2000 }),
        rechnung({ datum: '2026-05-01', netto: 2000 }),
        rechnung({ datum: '2026-06-01', netto: 2500 }),
      ],
    });
    expect(z.map((x) => x.kundenart)).toEqual(['neukunde', 'neukunde', 'bestand', 'upsell']);
  });
  it('neuer gewonnener Close-Deal nach den ersten 30 Tagen macht die Folgerechnung zum Upsell', () => {
    const z = klassifiziere({
      kunden: [kunde()],
      fakturiert: [],
      abschluesse: [{ lead_id: 'l1', lead_name: 'Turhan Vertriebs', wert: 5000, datum: '2026-06-10T10:00:00Z', quelle: 'Meta' }],
      rechnungen: [rechnung({ datum: '2026-03-02', netto: 3000 }), rechnung({ datum: '2026-06-15', netto: 1500, positionen: ['Sonderleistung'] })],
    });
    expect(z[1].kundenart).toBe('upsell');
  });
  it('ordnet die Leadquelle über den ursprünglichen Close-Deal zu', () => {
    const z = klassifiziere({
      kunden: [kunde()],
      fakturiert: [],
      abschluesse: [{ lead_id: 'l1', lead_name: 'Turhan Vertriebs GmbH', wert: 9000, datum: '2026-02-20', quelle: 'facebook_ads' }],
      rechnungen: [rechnung()],
    });
    expect(z[0].quelle).toBe('Meta Ads');
  });
  it('Rechnung ohne verknüpften Kontakt findet den Kunden über den Namen', () => {
    const z = klassifiziere({ kunden: [kunde({ lex_contact_id: null })], fakturiert: [], abschluesse: [], rechnungen: [rechnung({ contactId: 'x' })] });
    expect(z[0].kunde?.id).toBe('k1');
  });
});

describe('quellenKategorie', () => {
  it('fasst Quellen zusammen', () => {
    expect(quellenKategorie('Empfehlung von Kunde')).toBe('Empfehlung');
    expect(quellenKategorie('linkedin')).toBe('LinkedIn');
    expect(quellenKategorie(null)).toBe('Unbekannt');
  });
});

describe('mrr', () => {
  it('zählt nur aktive Kunden, Abwanderung separat', () => {
    const m = mrr([kunde(), kunde({ id: 'k2', name: 'B', mrr: 1500, fulfillment_phase: 'beendet' }), kunde({ id: 'k3', name: 'C', mrr: null })]);
    expect(m.mrr).toBe(2000);
    expect(m.aktiveKunden).toBe(2);
    expect(m.kundenMitMrr).toBe(1);
    expect(m.abwanderung).toMatchObject({ kunden: 1, entgangenerMrr: 1500 });
  });
});

describe('berechneUmsatz', () => {
  it('summiert Zeitraum, bezahlt/offen und vergleicht mit der Vorperiode', () => {
    const { zeitraum, vorperiode } = zeitraumFuer('monat', '2026-06-15');
    const a = berechneUmsatz({
      kunden: [kunde()],
      fakturiert: [],
      abschluesse: [],
      rechnungen: [
        rechnung({ datum: '2026-03-02', netto: 3000 }),
        rechnung({ datum: '2026-05-01', netto: 2000 }),
        rechnung({ datum: '2026-06-01', netto: 2000, status: 'open' }),
        rechnung({ datum: '2026-06-05', netto: null, brutto: 119 }),
      ],
      zeitraum,
      vorperiode,
      heute: '2026-06-15',
      closeVerbunden: true,
    });
    expect(a.summen.gestellt).toBe(2100);
    expect(a.summen.bezahlt).toBe(100);
    expect(a.summen.offen).toBe(2000);
    expect(a.summen.vorperiode.gestellt).toBe(2000);
    expect(a.summen.veraenderung).toBe(5);
    expect(a.nettoGeschaetzt).toBe(1);
    expect(a.verlauf.at(-1)?.monat).toBe('2026-06');
  });
});

describe('zeitraumFuer', () => {
  it('Quartal und 12 Monate', () => {
    expect(zeitraumFuer('quartal', '2026-10-08').zeitraum).toEqual({ von: '2026-10-01', bis: '2027-01-01' });
    expect(zeitraumFuer('12m', '2026-10-08').zeitraum).toEqual({ von: '2025-11-01', bis: '2026-11-01' });
  });
});
