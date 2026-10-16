import { describe, expect, it } from 'vitest';
import { angabenAusKontakt, angabenAusProfil } from '../angaben';

describe('Funnel-Angaben', () => {
  it('Webhook-Profil: Fragen mit Titel, ohne Kontakt, Tracking und Datenschutz', () => {
    expect(
      angabenAusProfil({
        firstName: { value: 'Bajro', title: 'Dein Vorname' },
        email: { value: 'x@y.de', title: 'E-Mail' },
        question_myfv2x: { value: 'Ja, habe ich bereits', title: 'Hast du bereits Erfahrung im Vertrieb?' },
        question_r1eub8: { value: 'Geld verdienen', title: 'Was ist Dir wichtig in deinem neuen Job?' },
        question_yevz4q: { value: 'Geiles Umfeld', title: 'Was ist Dir wichtig in deinem neuen Job?' },
        input_dqfjaa: { value: true, title: 'Ich verstehe und akzeptiere die Datenschutzbestimmungen.' },
        utm_source: { value: 'ig', title: 'UTM Source' },
        ohne_titel: 'irgendwas',
      }),
    ).toEqual({
      'Hast du bereits Erfahrung im Vertrieb?': 'Ja, habe ich bereits',
      'Was ist Dir wichtig in deinem neuen Job?': 'Geld verdienen, Geiles Umfeld',
    });
  });

  it('Kontakt + Schema (Nachtragen)', () => {
    expect(
      angabenAusKontakt(
        { question_yvzfse: 'Nachmittags (12-18Uhr)', fbclid: 'abc', input_dqfjaa: true, unbekannt: 'x' },
        [
          { fieldName: 'question_yvzfse', title: 'Wann können wir dich telefonisch am besten erreichen?' },
          { fieldName: 'input_dqfjaa', title: 'Ich verstehe und akzeptiere die Datenschutzbestimmungen.' },
        ],
      ),
    ).toEqual({ 'Wann können wir dich telefonisch am besten erreichen?': 'Nachmittags (12-18Uhr)' });
  });
});
