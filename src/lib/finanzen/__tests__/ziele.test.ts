import { describe, expect, it } from 'vitest';
import { kundenKennzahlen, liesZiele, neukundenFuerZiel, STANDARD_ZIELE, zielZeilen } from '../ziele';
import type { FinanzRechnung } from '../zahlungen';

const r = (contact_id: string, datum: string, netto: number): FinanzRechnung => ({
  voucher_id: `${contact_id}-${datum}`,
  nummer: null,
  contact_id,
  kontakt: contact_id,
  datum,
  faellig: null,
  brutto: netto * 1.19,
  netto,
  offen: 0,
  status: 'paid',
  bezahlt_am: datum,
});

describe('Ziele', () => {
  it('Standardwerte und gespeicherte Ziele', () => {
    expect(liesZiele(null)).toEqual(STANDARD_ZIELE);
    expect(liesZiele('{"neukundenMonat": 20, "upsellQuote": "x"}')).toMatchObject({ neukundenMonat: 20, upsellQuote: 0.65 });
  });

  it('Kunden-Kennzahlen: neu, verloren, Upsell, LTV', () => {
    const k = kundenKennzahlen(
      [
        r('A', '2026-07-01', 1000), r('A', '2026-08-01', 1000), r('A', '2026-09-01', 2500), r('A', '2026-10-01', 2500), // Upsell, bleibt
        r('B', '2026-07-01', 2000), r('B', '2026-08-01', 1000), // weg seit Sep
        r('C', '2026-10-05', 2000), // neu
      ],
      '2026-10',
    );
    expect(k).toMatchObject({ zahlend: 2, neu: 1, verloren: 1, ltvWiederkehrend: 7000 });
    expect(k.churn).toBe(0.5);
    expect(k.upsellQuote).toBe(0.5);
  });

  it('Zielzeilen und Neukunden für das Umsatzziel', () => {
    const z = zielZeilen({
      ziele: STANDARD_ZIELE,
      einnahmen: 50_000,
      monatsgebuehren: 40_000,
      ueberschuss: 20_000,
      werbung: 9_000,
      aktiveVertraege: 30,
      kunden: { zahlend: 25, neu: 5, verloren: 2, churn: 0.08, upsellQuote: 0.44, ltvWiederkehrend: 14_500 },
    });
    expect(Object.fromEntries(z.map((x) => [x.key, x.erreicht]))).toEqual({
      umsatz: false,
      neukunden: false,
      upsell: false,
      churn: true,
      kopf: false,
      marge: false,
      werbung: true,
    });
    expect(neukundenFuerZiel(300_000, 14_500)).toBe(21);
  });
});
