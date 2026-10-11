import { describe, expect, it } from 'vitest';
import { darfKontakt, liesSchalter } from '../kontakt-schalter';

describe('Bewerber-Kontakt-Schalter', () => {
  it('aus: niemand außer Testnummern/-adressen', () => {
    const s = liesSchalter('{"aktiv":false,"testnummern":["0151 2345678"],"testmails":["felix@zoeppmedia.de"]}');
    expect(darfKontakt(s, { telefon: '+491512345678' })).toBe(true);
    expect(darfKontakt(s, { telefon: '+491709999999' })).toBe(false);
    expect(darfKontakt(s, { email: 'Felix@Zoeppmedia.de' })).toBe(true);
    expect(darfKontakt(s, { email: 'bewerber@web.de' })).toBe(false);
  });
  it('fehlende oder kaputte Einstellung = aus', () => {
    expect(darfKontakt(liesSchalter(null), { telefon: '+491709999999' })).toBe(false);
    expect(darfKontakt(liesSchalter('kaputt'), { telefon: '+491709999999' })).toBe(false);
  });
  it('an: alle', () => {
    expect(darfKontakt(liesSchalter({ aktiv: true }), { telefon: '+491709999999' })).toBe(true);
  });
});
