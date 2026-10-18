import { describe, expect, it } from 'vitest';
import { alternativText, fuelleFragen, istJa, vorschlagText, waehleSlot, zeitFenster, type Frage } from '../auto-buchung';

// Sonntag, 18.10.2026, 20:00 Berlin
const jetzt = new Date('2026-10-18T18:00:00Z');
const slots = [
  '2026-10-19T07:00:00Z', // Mo 9:00
  '2026-10-19T08:00:00Z', // Mo 10:00
  '2026-10-19T08:30:00Z', // Mo 10:30
  '2026-10-19T13:00:00Z', // Mo 15:00
  '2026-10-20T08:00:00Z', // Di 10:00
];

describe('zeitFenster', () => {
  it('liest genaue Zeiten, Fenster und Tageszeiten', () => {
    expect(zeitFenster('10:00')).toEqual({ ab: 600, bis: 600, genau: true });
    expect(zeitFenster('ab 17 Uhr')).toMatchObject({ ab: 1020, genau: false });
    expect(zeitFenster('nachmittags')).toMatchObject({ ab: 780, bis: 1080 });
    expect(zeitFenster(null)).toBeNull();
  });
});

describe('waehleSlot', () => {
  it('genau frei → Treffer', () => {
    expect(waehleSlot(slots, '2026-10-19', '10:00')).toEqual({ slot: '2026-10-19T08:00:00Z', alternativen: [] });
  });
  it('Fenster → erster Slot darin', () => {
    expect(waehleSlot(slots, '2026-10-19', 'nachmittags').slot).toBe('2026-10-19T13:00:00Z');
  });
  it('belegt → zwei nahe Alternativen am selben Tag', () => {
    expect(waehleSlot(slots, '2026-10-19', '11:00')).toEqual({ slot: null, alternativen: ['2026-10-19T08:00:00Z', '2026-10-19T08:30:00Z'] });
  });
  it('Tag voll → nächste Tage', () => {
    expect(waehleSlot(slots, '2026-10-20', '15:00')).toEqual({ slot: null, alternativen: ['2026-10-20T08:00:00Z'] });
  });
});

describe('istJa', () => {
  it('erkennt Zusagen, aber keine Änderungswünsche', () => {
    for (const t of ['Ja', 'ja passt', 'Perfekt!', 'Gerne', 'ok', '👍']) expect(istJa(t)).toBe(true);
    for (const t of ['Ja aber lieber 11', 'Nein', 'geht nicht', 'Montag 15 Uhr']) expect(istJa(t)).toBe(false);
  });
});

describe('Texte', () => {
  it('Vorschlag und Alternativen', () => {
    expect(vorschlagText('2026-10-19T08:00:00Z', jetzt)).toBe('Super! Dann trage ich dich für morgen um 10:00 Uhr ein – 15 Minuten, wir rufen dich an. Passt das? Antworte einfach kurz mit „Ja“.');
    expect(alternativText('Montag 11 Uhr', ['2026-10-19T08:00:00Z', '2026-10-19T08:30:00Z'], jetzt)).toBe('Montag 11 Uhr ist leider schon vergeben. Passt dir morgen um 10:00 Uhr oder morgen um 10:30 Uhr?');
  });
});

describe('fuelleFragen', () => {
  const fragen: Frage[] = [
    { name: 'Unternehmensname', type: 'string', position: 0, enabled: true, required: true, answer_choices: [] },
    { name: 'Was verkauft dein Unternehmen?', type: 'single_select', position: 1, enabled: true, required: true, answer_choices: ['Photovoltaik', 'Strom & Gas', 'Sonstiges'] },
    { name: 'Wie viel Mitarbeiter/Partner stellst du aktuell ein pro Monat?', type: 'single_select', position: 2, enabled: true, required: true, answer_choices: ['0-2 Mitarbeiter/Partner', '3-6 Mitarbeiter/Partner', '7-11 Mitarbeiter/Partner', '12+ Mitarbeiter/Partner'] },
    { name: 'Welche Probleme hast du aktuell beim Recruiting?', type: 'multi_select', position: 3, enabled: true, required: true, answer_choices: ['Unqualifizierte Leads', 'Keine Highperformer aus Neueinstellungen', 'Zu wenig Leads', 'Unregelmäßige Einstellungen'] },
    { name: 'Zusätzliche Notizen die wichtig sind als Vorbereitung?', type: 'text', position: 4, enabled: true, required: false, answer_choices: [] },
  ];
  it('füllt aus den Funnel-Angaben', () => {
    const a = fuelleFragen(fragen, { firma: 'MBA Energiekonzepte', branche: 'Photovoltaik', ziel: '3 bis 5 Vertriebler', problem: 'Schlechte Bewerber', notiz: 'Per WhatsApp gebucht' });
    expect(a.map((x) => x.answer)).toEqual(['MBA Energiekonzepte', 'Photovoltaik', '3-6 Mitarbeiter/Partner', 'Unqualifizierte Leads', 'Per WhatsApp gebucht']);
  });
  it('Pflichtfragen ohne Angabe bekommen eine neutrale Antwort', () => {
    const a = fuelleFragen(fragen, { firma: null, branche: null, ziel: null, problem: null, notiz: 'x' });
    expect(a.map((x) => x.answer)).toEqual(['Bitte im Gespräch erfragen', 'Sonstiges', '0-2 Mitarbeiter/Partner', 'Unqualifizierte Leads', 'x']);
  });
});
