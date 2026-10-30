import { describe, expect, it } from 'vitest';
import { STANDARD_ANNAHMEN, abschluesseFuerZiel, funnelBedarf, funnelQuoten, hochlauf, zielErreichtNach } from '../prognose';

const basis = { ...STANDARD_ANNAHMEN, startMrr: 41_000 };

describe('Hochlauf', () => {
  it('rechnet wie die Planung mit Felix (10 bzw. 16 Abschlüsse/Monat)', () => {
    const r10 = hochlauf({ ...basis, abschluesseMonat: 10 }, 14);
    const nah = (ist: number, soll: number) => expect(Math.abs(ist - soll)).toBeLessThanOrEqual(2);
    nah(r10[2], 74_502);
    nah(r10[13], 197_401);
    nah(hochlauf({ ...basis, abschluesseMonat: 16 }, 14)[13], 303_213);
  });
  it('Ziel nach Monaten und nötige Abschlüsse', () => {
    expect(zielErreichtNach({ ...basis, abschluesseMonat: 16 }, 300_000)).toBe(13);
    expect(abschluesseFuerZiel(basis, 300_000, 14)).toBe(16);
    expect(zielErreichtNach({ ...basis, abschluesseMonat: 2 }, 300_000)).toBeNull();
  });
});

describe('Funnel', () => {
  const f = { ausgaben: 5398, leads: 43, settingsGebucht: 46, settingsGehalten: 36, closingsGebucht: 31, closingsGehalten: 25, abschluesse: 20, upsells: 6 };
  it('Quoten aus den Oktober-Zahlen', () => {
    const q = funnelQuoten(f);
    expect(q.closingQuote).toBeCloseTo(0.56);
    expect(q.showSetting).toBeCloseTo(0.78, 2);
    expect(Math.round(q.kostenProLead!)).toBe(126);
  });
  it('Bedarf für 16 Abschlüsse', () => {
    const b = funnelBedarf(16, funnelQuoten(f), f)!;
    expect(b.closingsGehalten).toBe(29);
    expect(b.leads).toBeGreaterThan(40);
    expect(b.werbung).toBeGreaterThan(5000);
  });
});

describe('Upsell-Zeitversatz', () => {
  it('früherer Upsell bringt im 2./3. Monat mehr Umsatz, Median der Tage', async () => {
    const { medianTageBisUpsell } = await import('../prognose');
    const spaet = hochlauf({ ...basis, startMrr: 0, abschluesseMonat: 10 }, 3);
    const frueh = hochlauf({ ...basis, startMrr: 0, abschluesseMonat: 10, upsellAbMonat: 1 }, 3);
    expect(frueh[0]).toBe(spaet[0]);
    expect(frueh[2]).toBeGreaterThan(spaet[2]);
    expect(medianTageBisUpsell([13, 22, 26, 35, 41, 70, 86])).toBe(35);
    expect(medianTageBisUpsell([])).toBeNull();
  });
});
