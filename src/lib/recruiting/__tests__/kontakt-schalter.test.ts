import { describe, expect, it } from 'vitest';
import { darfKontakt, liesSchalter, setzeKunde } from '../kontakt-schalter';

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
  it('pro Kunde: nur die freigegebenen Agenturen', () => {
    const s = liesSchalter('{"aktiv":false,"testnummern":[],"testmails":[],"kunden":["ag-1"]}');
    expect(darfKontakt(s, { telefon: '+491709999999', agencyId: 'ag-1' })).toBe(true);
    expect(darfKontakt(s, { email: 'bewerber@web.de', agencyId: 'ag-1' })).toBe(true);
    expect(darfKontakt(s, { telefon: '+491709999999', agencyId: 'ag-2' })).toBe(false);
    expect(darfKontakt(s, { telefon: '+491709999999' })).toBe(false);
    expect(darfKontakt(s, { telefon: '+491709999999', agencyId: null })).toBe(false);
  });
  it('alte Einstellung ohne kunden + kaputte Einträge', () => {
    expect(liesSchalter('{"aktiv":false}').kunden).toEqual([]);
    expect(liesSchalter({ kunden: ['a', 'a', 3, '', null, 'b'] }).kunden).toEqual(['a', 'b']);
  });
  it('setzeKunde schaltet genau einen Kunden, ohne den Rest anzufassen', () => {
    const s = liesSchalter({ aktiv: false, testnummern: ['+49151'], kunden: ['a'] });
    const an = setzeKunde(s, 'b', true);
    expect(an.kunden).toEqual(['a', 'b']);
    expect(an.testnummern).toEqual(['+49151']);
    expect(setzeKunde(an, 'b', true).kunden).toEqual(['a', 'b']);
    expect(setzeKunde(an, 'a', false).kunden).toEqual(['b']);
    expect(setzeKunde(s, 'x', false).kunden).toEqual(['a']);
    expect(s.kunden).toEqual(['a']);
  });
});
