import { describe, it, expect } from 'vitest';
import { pruefeAnfrage } from '../anfragen';

describe('pruefeAnfrage', () => {
  it('akzeptiert eine gültige Frage', () => {
    expect(pruefeAnfrage({ art: 'frage', thema: ' WhatsApp verbinden ', nachricht: 'Wie geht das?' })).toEqual({
      ok: true, art: 'frage', thema: 'WhatsApp verbinden', nachricht: 'Wie geht das?', empfehlungId: null,
    });
  });
  it('Interesse braucht keine Nachricht', () => {
    expect(pruefeAnfrage({ art: 'interesse', thema: 'Nächste Stufe: Growth', empfehlungId: 'leistung_growth' })).toMatchObject({ ok: true, empfehlungId: 'leistung_growth' });
  });
  it('lehnt fehlende Angaben ab', () => {
    expect(pruefeAnfrage({ art: 'quatsch', thema: 'abc' })).toMatchObject({ ok: false });
    expect(pruefeAnfrage({ art: 'frage', thema: 'x' })).toMatchObject({ ok: false });
    expect(pruefeAnfrage({ art: 'problem', thema: 'Login geht nicht' })).toMatchObject({ ok: false, fehler: 'Bitte beschreibe kurz dein Anliegen.' });
  });
});
