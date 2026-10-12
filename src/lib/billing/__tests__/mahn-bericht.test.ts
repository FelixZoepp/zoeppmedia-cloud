import { describe, expect, it } from 'vitest';
import { berechneMahnBericht, type MahnFall } from '../mahnwesen';

const fall = (p: Partial<MahnFall>): MahnFall => ({
  id: Math.random().toString(36), agency_id: null, lex_invoice_id: 'x', rechnungsnummer: 'RE-1', kontakt_name: 'Kunde A',
  betrag_offen: 1000, rechnungsdatum: '2026-09-01', zahlungsziel: '2026-09-15', typ: 'retainer', schritt: 1, status: 'offen', zugesagt_bis: null, ...p,
});

describe('Zahlungsausfall-Bericht', () => {
  it('summiert offen, überfällig, Anwalt, Risiko und Schuldner', () => {
    const b = berechneMahnBericht(
      [
        fall({ betrag_offen: 1000, schritt: 3 }),
        fall({ betrag_offen: 500, zahlungsziel: '2026-10-20' }), // noch nicht fällig
        fall({ betrag_offen: 2000, schritt: 6, kontakt_name: 'Kunde B', einschaetzung: 'unsicher' }),
        fall({ betrag_offen: 3000, status: 'anwalt', schritt: 7, kontakt_name: 'Kunde C' }),
        fall({ betrag_offen: 800, status: 'bezahlt', bezahlt_am: '2026-10-10T10:00:00Z' }),
        fall({ betrag_offen: 400, zugesagt_bis: '2026-10-20', einschaetzung: 'zahlt' }),
      ],
      '2026-10-12',
    );
    expect(b.offen).toEqual({ anzahl: 4, summe: 3900 });
    expect(b.ueberfaellig).toEqual({ anzahl: 3, summe: 3400 });
    expect(b.anwalt.summe).toBe(3000);
    expect(b.ausfallRisiko).toBe(5000);
    expect(b.bezahlt30.summe).toBe(800);
    expect(b.zugesagt.summe).toBe(400);
    expect(b.einschaetzung).toEqual({ zahlt: 1, unsicher: 1, ausfall: 0 });
    expect(b.schuldner[0]).toMatchObject({ kunde: 'Kunde C', summe: 3000 });
    expect(b.nachSchritt.find((x) => x.schritt === 6)?.summe).toBe(2000);
  });
});
