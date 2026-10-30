import { describe, expect, it } from 'vitest';
import { abschlussQuoten, istProMonat, zahlungsmoral, type FinanzRechnung } from '../zahlungen';
import { findeKontakt, zahlungsdatum, alsZeile } from '../lexware-abgleich';
import type { FinanzVertrag } from '../cashplan';

const r = (p: Partial<FinanzRechnung>): FinanzRechnung => ({
  voucher_id: p.nummer ?? 'x',
  nummer: null,
  contact_id: 'k1',
  kontakt: 'Kunde',
  datum: '2026-10-01',
  faellig: '2026-10-08',
  brutto: 1190,
  netto: 1000,
  offen: 0,
  status: 'paid',
  bezahlt_am: '2026-10-05',
  ...p,
});

const v = (p: Partial<FinanzVertrag> & { lex_contact_id?: string | null }) =>
  ({
    id: p.kunde ?? 'v',
    kunde: 'v',
    monatlich: 1000,
    setup: 0,
    setup_monat: null,
    start: '2026-10-01',
    laufzeit_monate: 3,
    verlaengerung_monatlich: null,
    ust_satz: 19,
    rechnungstag: 1,
    status: 'aktiv',
    notiz: null,
    ...p,
  }) as FinanzVertrag;

describe('Ist je Monat', () => {
  it('nach Zahlungsdatum, offene zählen nicht, netto ohne Detail geschätzt', () => {
    const m = istProMonat([
      r({ nummer: 'a' }),
      r({ nummer: 'b', bezahlt_am: '2026-11-02', netto: null, brutto: 2380 }),
      r({ nummer: 'c', status: 'open', bezahlt_am: null }),
    ]);
    expect(m.get('2026-10')).toEqual({ netto: 1000, brutto: 1190, anzahl: 1 });
    expect(m.get('2026-11')?.netto).toBe(2000);
  });
});

describe('Zahlungsmoral', () => {
  it('Ø Tage, pünktlich, offen und überfällig', () => {
    const z = zahlungsmoral(
      [
        r({ nummer: 'a', bezahlt_am: '2026-10-05' }), // 4 Tage, pünktlich
        r({ nummer: 'b', bezahlt_am: '2026-10-21' }), // 20 Tage, zu spät
        r({ nummer: 'c', status: 'open', bezahlt_am: null, offen: 1190, faellig: '2026-10-20' }),
        r({ nummer: 'd', status: 'open', bezahlt_am: null, offen: 500, faellig: '2026-11-30' }),
      ],
      '2026-10-30',
    );
    expect(z.tageBisZahlung).toBe(12);
    expect(z.puenktlich).toBe(0.5);
    expect(z.offenBrutto).toBe(1690);
    expect(z.ueberfaelligBrutto).toBe(1190);
    expect(z.ueberfaellig.map((x) => x.nummer)).toEqual(['c']);
  });
});

describe('Abschluss-Quoten', () => {
  it('Abschlüsse je Monat und Tage bis zum ersten Geld', () => {
    const q = abschlussQuoten(
      [
        v({ kunde: 'A', abschluss_am: '2026-10-01', lex_contact_id: 'k1' }),
        v({ kunde: 'B', abschluss_am: '2026-10-15', lex_contact_id: 'k2' }),
        v({ kunde: 'C', abschluss_am: '2026-09-10', status: 'streitfall' }),
      ],
      [r({ contact_id: 'k1', bezahlt_am: '2026-10-11' }), r({ contact_id: 'k1', bezahlt_am: '2026-09-01' })],
    );
    expect(q.proMonat).toEqual([
      { monat: '2026-09', abschluesse: 1, streitfaelle: 1 },
      { monat: '2026-10', abschluesse: 2, streitfaelle: 0 },
    ]);
    expect(q.tageBisErstesGeld).toBe(10);
    expect(q.ohneZahlung.map((x) => x.kunde)).toEqual(['B']);
  });
});

describe('Lexware-Abgleich (rein)', () => {
  it('Zahlungsdatum aus paidDate oder letzter Buchung', () => {
    expect(zahlungsdatum({ paidDate: '2026-10-05T10:00:00.000+02:00' })).toBe('2026-10-05');
    expect(zahlungsdatum({ paymentItems: [{ postingDate: '2026-10-03' }, { postingDate: '2026-10-09' }] })).toBe('2026-10-09');
    expect(zahlungsdatum(null)).toBeNull();
  });
  it('Kontakt nur bei eindeutigem Treffer', () => {
    const k = [
      { id: '1', name: 'Hoffmann Solutions GmbH' },
      { id: '2', name: 'Voltweit³ GmbH' },
    ];
    expect(findeKontakt('Hoffmann Solutions', k)).toBe('1');
    expect(findeKontakt('Unbekannt AG', k)).toBeNull();
  });
  it('Voucherlist-Zeile', () => {
    expect(alsZeile({ id: 'x', voucherNumber: 'RE0597', voucherDate: '2026-10-28T00:00:00.000+01:00', totalAmount: 1000, voucherStatus: 'open' })).toMatchObject({
      voucher_id: 'x',
      nummer: 'RE0597',
      datum: '2026-10-28',
      brutto: 1000,
      status: 'open',
    });
  });
});

describe('Rechnungs-Check', () => {
  it('findet vergessene Monate und erkennt vorab geschriebene Rechnungen', async () => {
    const { rechnungsCheck, rechnungsplan } = await import('../zahlungen');
    const { gebuehrImMonat, setupImMonat } = await import('../cashplan');
    const betrag = (x: FinanzVertrag, m: string) => gebuehrImMonat(x, m, false) + setupImMonat(x, m);
    const vertraege = [
      v({ kunde: 'Krüger', monatlich: 3500, laufzeit_monate: null, start: '2026-08-01', lex_contact_id: 'k1' }),
      v({ kunde: 'Ohne', monatlich: 1000, start: '2026-10-01' }),
    ];
    const rechnungen = [
      r({ nummer: 'a', contact_id: 'k1', datum: '2026-08-01', netto: 3500 }),
      r({ nummer: 'b', contact_id: 'k1', datum: '2026-10-01', netto: 3500 }),
    ];
    const c = rechnungsCheck(vertraege, rechnungen, '2026-10', betrag);
    expect(c.luecken.map((l) => [l.vertrag.kunde, l.monat, l.fehlt])).toEqual([['Krüger', '2026-09', 3500]]);
    expect(c.nichtZugeordnet.map((x) => x.kunde)).toEqual(['Ohne']);
    const plan = rechnungsplan(vertraege, rechnungen, '2026-10', betrag);
    expect(plan.map((p) => [p.vertrag.kunde, p.geschrieben])).toEqual([
      ['Krüger', true],
      ['Ohne', false],
    ]);
  });
});

describe('Mehrere Lexware-Kontakte je Vertrag', () => {
  it('Rechnungen beider Kontakte zählen für den Vertrag', async () => {
    const { rechnungsCheck } = await import('../zahlungen');
    const { gebuehrImMonat } = await import('../cashplan');
    const vertraege = [v({ kunde: 'Özdemir', monatlich: 2000, laufzeit_monate: null, start: '2026-10-01', lex_contact_id: 'k1,k2' })];
    const rechnungen = [r({ nummer: 'a', contact_id: 'k1', datum: '2026-10-02', netto: 1000 }), r({ nummer: 'b', contact_id: 'k2', datum: '2026-10-02', netto: 1000 })];
    expect(rechnungsCheck(vertraege, rechnungen, '2026-10', (x, m) => gebuehrImMonat(x, m, false)).luecken).toEqual([]);
  });
});
