import { describe, it, expect } from 'vitest';
import { faelligerSchritt, naechsterSchritt, schrittDatum, aktionErfassen, type MahnFall } from '../mahnwesen';
import { MAHN_SCHRITTE, fill } from '../mahnwesen-vorlagen';
import { createFakeDb } from '@/lib/fulfillment/__tests__/fake-db';

const fall = (over: Partial<MahnFall> = {}): MahnFall => ({
  id: 'c1', agency_id: 'ag-1', lex_invoice_id: 'lex-1', rechnungsnummer: 'RE0600', kontakt_name: 'CGMS GmbH',
  betrag_offen: 1785, rechnungsdatum: '2026-10-01', zahlungsziel: '2026-10-08', typ: 'retainer', schritt: 1,
  status: 'offen', zugesagt_bis: null, ...over,
});

describe('Zoepp System: Zeitplan', () => {
  it('Schritte und Tage wie in der Checkliste', () => {
    expect(MAHN_SCHRITTE.map((s) => [s.schritt, s.basis, s.tage])).toEqual([
      [1, 'rechnung', 0], [2, 'rechnung', 1], [3, 'ziel', 5], [4, 'ziel', 10], [5, 'ziel', 15], [6, 'ziel', 20], [7, 'ziel', 30],
    ]);
  });

  it('Kuschel-Call 1 Tag nach Rechnung – nur bei Einrichtungsgebühr', () => {
    expect(faelligerSchritt(fall({ typ: 'setup' }), '2026-10-02')?.titel).toBe('Kuschel-Call');
    expect(faelligerSchritt(fall({ typ: 'retainer' }), '2026-10-02')).toBeNull();
  });

  it('Monatsrechnung startet bei Schritt 3 (5 Tage nach Zahlungsziel)', () => {
    expect(naechsterSchritt(fall())).toEqual({ schritt: expect.objectContaining({ schritt: 3 }), datum: '2026-10-13' });
    expect(faelligerSchritt(fall(), '2026-10-12')).toBeNull();
    expect(faelligerSchritt(fall(), '2026-10-13')?.titel).toBe('Erinnerung-Call');
  });

  it('nach erledigtem Schritt 3 ist am Tag 10 Mahnung 1 dran', () => {
    expect(faelligerSchritt(fall({ schritt: 3 }), '2026-10-18')?.titel).toBe('Mahnung 1 Call');
  });

  it('spät erfasst → der höchste fällige Schritt (kein Abarbeiten aller Anrufe)', () => {
    expect(faelligerSchritt(fall(), '2026-10-29')?.schritt).toBe(6);
    expect(faelligerSchritt(fall(), '2026-11-07')?.schritt).toBe(7);
  });

  it('Zahlungszusage → bis zum zugesagten Datum Ruhe', () => {
    expect(faelligerSchritt(fall({ zugesagt_bis: '2026-10-20' }), '2026-10-15')).toBeNull();
    expect(faelligerSchritt(fall({ zugesagt_bis: '2026-10-20' }), '2026-10-21')?.schritt).toBe(4);
  });

  it('bezahlte Fälle sind raus', () => {
    expect(faelligerSchritt(fall({ status: 'bezahlt' }), '2026-12-01')).toBeNull();
  });

  it('Datum je Schritt', () => {
    expect(schrittDatum(fall(), MAHN_SCHRITTE[6])).toBe('2026-11-07');
  });
});

describe('Vorlagen', () => {
  it('Platzhalter werden gefüllt, unbekannte bleiben stehen', () => {
    expect(fill('Hallo {VORNAME}, Rechnung {RECHNUNGSNUMMER} {X}', { VORNAME: 'Max', RECHNUNGSNUMMER: 'RE0600' })).toBe(
      'Hallo Max, Rechnung RE0600 {X}',
    );
  });

  it('Anwalt-Mail geht an die Kanzlei', () => {
    expect(MAHN_SCHRITTE[6].mail?.an).toBe('rechtsanwaelte@cherek.org');
  });
});

describe('aktionErfassen', () => {
  it('Erreicht mit Zusage → Schritt hochgezählt, Zusage gespeichert', async () => {
    const { client, tables } = createFakeDb({ dunning_cases: [{ ...fall() }] });
    await aktionErfassen(client, 'c1', 3, 'erreicht', { zugesagt_bis: '2026-10-20', userId: 'petra' });
    expect(tables.dunning_cases[0]).toMatchObject({ schritt: 3, zugesagt_bis: '2026-10-20' });
    expect(tables.dunning_actions[0]).toMatchObject({ schritt: 3, ergebnis: 'erreicht', user_id: 'petra' });
  });

  it('An Anwalt abgegeben → Fall beim Anwalt, Kunde pausiert (Zurückbehaltungsrecht)', async () => {
    const { client, tables } = createFakeDb({ dunning_cases: [{ ...fall({ schritt: 6 }) }], agencies: [{ id: 'ag-1' }] });
    await aktionErfassen(client, 'c1', 7, 'abgegeben');
    expect(tables.dunning_cases[0].status).toBe('anwalt');
    expect(tables.agencies[0].pausiert_grund).toContain('Zurückbehaltungsrecht');
  });
});
