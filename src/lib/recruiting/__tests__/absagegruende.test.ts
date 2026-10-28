import { describe, expect, it } from 'vitest';
import { ABSAGE_GRUENDE, absageAusBody, aggHinweis, ablehngrundText, pruefeAbsage } from '../absagegruende';

describe('Absagegründe', () => {
  it('Katalog hat eindeutige Codes und keine AGG-Merkmale', () => {
    expect(new Set(ABSAGE_GRUENDE.map((g) => g.code)).size).toBe(ABSAGE_GRUENDE.length);
    for (const g of ABSAGE_GRUENDE) expect(aggHinweis(g.label)).toBe(false);
  });

  it('pruefeAbsage verlangt bekannten Code und bei Sonstiges eine Notiz', () => {
    expect(pruefeAbsage({})).toEqual({ fehler: expect.any(String) });
    expect(pruefeAbsage({ code: 'gibtsnicht' })).toEqual({ fehler: expect.any(String) });
    expect(pruefeAbsage({ code: 'sonstiges', notiz: '  ' })).toEqual({ fehler: expect.any(String) });
    expect(pruefeAbsage({ code: 'sonstiges', notiz: ' zu weit weg ' })).toEqual({ code: 'sonstiges', notiz: 'zu weit weg' });
    expect(pruefeAbsage({ code: 'wenig_energie' })).toEqual({ code: 'wenig_energie', notiz: null });
    expect(pruefeAbsage({ code: 'ohne_grund' })).toEqual({ fehler: expect.any(String) });
  });

  it('absageAusBody übernimmt Alt-Texte', () => {
    expect(absageAusBody({ rejection_reason: 'Mangelnde Einsatzbereitschaft' })).toEqual({ code: 'wenig_energie', notiz: null });
    expect(absageAusBody({ rejection_reason: 'Unter 18' })).toEqual({ code: 'unter_18', notiz: null });
    expect(absageAusBody({ rejection_reason: 'wohnt zu weit weg' })).toEqual({ code: 'sonstiges', notiz: 'wohnt zu weit weg' });
    expect(absageAusBody({ absage: { code: 'sprache' } })).toEqual({ code: 'sprache', notiz: null });
    expect(absageAusBody({})).toEqual({ fehler: expect.any(String) });
  });

  it('ablehngrundText und AGG-Hinweis', () => {
    expect(ablehngrundText('nicht_erreichbar', null)).toBe('Meldet sich nicht / nicht erreichbar');
    expect(ablehngrundText('sonstiges', 'kein Interesse')).toBe('Sonstiges: kein Interesse');
    expect(aggHinweis('ist zu alt')).toBe(true);
    expect(aggHinweis('Frau passt nicht ins Team')).toBe(true);
    expect(aggHinweis('klang müde am Telefon')).toBe(false);
  });
});
