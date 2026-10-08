import { describe, it, expect } from 'vitest';
import { UMFRAGEN_AB, faelligeUmfragen, findeVorlage, folgenAusAntwort, pruefeAntworten, type Frage } from '../planung';

const TAG = 86_400_000;
const d = (iso: string) => new Date(iso);

describe('Vorlagen-Zuordnung', () => {
  const vorlagen = [
    { id: 't-zuf', title: 'Kundenzufriedenheit (2-Wochen-Check)', active: true },
    { id: 't-onb', title: 'Onboarding-Feedback', active: true },
    { id: 't-ee', title: 'Erste Eindrücke', active: true },
    { id: 't-ges', title: 'Gesamtbewertung', active: true },
    { id: 't-alt', title: 'Gesamtbewertung alt', active: false },
  ];

  it('findet Vorlagen am Titel-Anfang, auch mit Zusatz in Klammern', () => {
    expect(findeVorlage(vorlagen, 'zufriedenheit')).toBe('t-zuf');
    expect(findeVorlage(vorlagen, 'onboarding')).toBe('t-onb');
    expect(findeVorlage(vorlagen, 'erste_eindruecke')).toBe('t-ee');
    expect(findeVorlage(vorlagen, 'gesamt')).toBe('t-ges');
  });

  it('ignoriert inaktive Vorlagen und liefert null, wenn keine passt', () => {
    expect(findeVorlage([{ id: 'x', title: 'Gesamtbewertung', active: false }], 'gesamt')).toBeNull();
    expect(findeVorlage([], 'zufriedenheit')).toBeNull();
  });
});

describe('Fälligkeit und kein Nachholen', () => {
  const ab = d('2026-10-09T00:00:00Z');

  it('neuer Kunde: Onboarding-Feedback sofort, Erste Eindrücke an Tag 7, 2-Wochen-Check an Tag 14', () => {
    const onb = d('2026-10-10T09:00:00Z');
    const keys = new Set<string>();
    expect(faelligeUmfragen({ onboardingAm: onb, now: d('2026-10-10T10:00:00Z'), vorhandeneKeys: keys, ab }).map((f) => f.trigger_key)).toEqual(['post_onboarding']);
    expect(faelligeUmfragen({ onboardingAm: onb, now: new Date(onb.getTime() + 7 * TAG), vorhandeneKeys: new Set(['post_onboarding']), ab }).map((f) => f.trigger_key)).toEqual(['erste_eindruecke']);
    expect(
      faelligeUmfragen({ onboardingAm: onb, now: new Date(onb.getTime() + 14 * TAG + 1000), vorhandeneKeys: new Set(['post_onboarding', 'erste_eindruecke']), ab }).map((f) => f.trigger_key),
    ).toEqual(['biweekly_1']);
  });

  it('Bestandskunde mit Onboarding vor dem Stichtag: nichts Verpasstes wird nachgeholt', () => {
    const onb = d('2026-08-01T09:00:00Z');
    expect(faelligeUmfragen({ onboardingAm: onb, now: d('2026-10-09T08:00:00Z'), vorhandeneKeys: new Set(), ab })).toEqual([]);
  });

  it('Bestandskunde bekommt erst den nächsten regulären 2-Wochen-Check nach dem Stichtag', () => {
    const onb = d('2026-08-01T09:00:00Z');
    // Perioden: 01.08. + 14·n → n=5 am 10.10. 09:00
    const erg = faelligeUmfragen({ onboardingAm: onb, now: d('2026-10-10T10:00:00Z'), vorhandeneKeys: new Set(), ab });
    expect(erg.map((f) => f.trigger_key)).toEqual(['biweekly_5']);
    expect(erg[0].faellig.toISOString()).toBe('2026-10-10T09:00:00.000Z');
  });

  it('Quartalsumfrage nur, wenn Quartalsbeginn nach dem Stichtag liegt', () => {
    const onb = d('2026-05-01T00:00:00Z');
    expect(faelligeUmfragen({ onboardingAm: onb, now: d('2026-10-20T00:00:00Z'), vorhandeneKeys: new Set(), ab }).some((f) => f.trigger_key.startsWith('quarterly'))).toBe(false);
    expect(faelligeUmfragen({ onboardingAm: onb, now: d('2027-01-05T00:00:00Z'), vorhandeneKeys: new Set(), ab }).map((f) => f.trigger_key)).toContain('quarterly_2027_Q1');
  });

  it('vorhandene Einträge werden nicht doppelt geplant; ohne Onboarding nichts', () => {
    const onb = d('2026-10-10T09:00:00Z');
    expect(faelligeUmfragen({ onboardingAm: onb, now: d('2026-10-10T10:00:00Z'), vorhandeneKeys: new Set(['post_onboarding']), ab })).toEqual([]);
    expect(faelligeUmfragen({ onboardingAm: null, now: d('2026-10-10T10:00:00Z'), vorhandeneKeys: new Set(), ab })).toEqual([]);
  });

  it('Stichtag ist der 09.10.2026', () => {
    expect(UMFRAGEN_AB.toISOString()).toBe('2026-10-09T00:00:00.000Z');
  });
});

const FRAGEN: Frage[] = [
  { id: 'overall', type: 'rating', label: 'Gesamt' },
  { id: 'kommunikation', type: 'rating', label: 'Kommunikation' },
  { id: 'mehr_bewerber', type: 'choice', label: 'Mehr?', options: ['Ja, locker', 'Vielleicht 1-2 mehr', 'Nein, passt so'] },
  { id: 'weiter_zusammenarbeit', type: 'choice', label: 'Weiter?', options: ['Ja, auf jeden Fall', 'Unsicher', 'Eher nicht'] },
  { id: 'nps', type: 'nps', label: 'Empfehlung' },
  { id: 'was_besser', type: 'text', label: 'Was besser?' },
];

describe('Antworten prüfen', () => {
  it('übernimmt nur gültige Werte zu echten Fragen', () => {
    expect(
      pruefeAntworten(FRAGEN, { overall: 4, kommunikation: 9, mehr_bewerber: 'Ja, locker', weiter_zusammenarbeit: 'Vielleicht', nps: 10, was_besser: '  mehr Tempo ', fremd: 'x' }),
    ).toEqual({ overall: 4, mehr_bewerber: 'Ja, locker', nps: 10, was_besser: 'mehr Tempo' });
    expect(pruefeAntworten(FRAGEN, null)).toEqual({});
  });
});

describe('Folgen einer Antwort', () => {
  it('Note ≤ 3 oder Zweifel an der Weiterarbeit → kritisch, keine Empfehlungsbitte', () => {
    expect(folgenAusAntwort(FRAGEN, { overall: 3, nps: 10 })).toMatchObject({ kritisch: true, empfehlung: false });
    expect(folgenAusAntwort(FRAGEN, { overall: 5, weiter_zusammenarbeit: 'Eher nicht' })).toMatchObject({ kritisch: true });
    expect(folgenAusAntwort(FRAGEN, { kommunikation: 2 })).toMatchObject({ kritisch: true });
  });

  it('Weiterempfehlung 9–10 → Empfehlung/Google-Bewertung anfragen', () => {
    expect(folgenAusAntwort(FRAGEN, { overall: 5, nps: 9 })).toMatchObject({ kritisch: false, empfehlung: true });
    expect(folgenAusAntwort(FRAGEN, { overall: 5, nps: 8 })).toMatchObject({ empfehlung: false });
  });

  it('„Ja, locker“ oder Budget-Erhöhung → Upsell', () => {
    expect(folgenAusAntwort(FRAGEN, { overall: 5, mehr_bewerber: 'Ja, locker' }).upsell).toBe(true);
    expect(folgenAusAntwort(FRAGEN, { overall: 5, budget_erhoehen: 'Ja, gerne' }).upsell).toBe(true);
    expect(folgenAusAntwort(FRAGEN, { overall: 4, mehr_bewerber: 'Nein, passt so' })).toEqual({ kritisch: false, empfehlung: false, upsell: false, gruende: [] });
  });
});
