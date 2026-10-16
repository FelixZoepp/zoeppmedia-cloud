import { describe, it, expect } from 'vitest';
import { baueSatz, grundOhneKi, naechsterMontag, nachrichtText, planeAbsage, waehleVorschlaege, zeitText } from '../absage';

// Freitag, 16.10.2026, 14:00 Uhr Berlin (12:00 UTC)
const jetzt = new Date('2026-10-16T12:00:00Z');

describe('grundOhneKi', () => {
  it('erkennt die Gründe', () => {
    expect(grundOhneKi('')).toBe('ohne_grund');
    expect(grundOhneKi(null)).toBe('ohne_grund');
    expect(grundOhneKi('Bin leider krank geworden')).toBe('krank');
    expect(grundOhneKi('Bin bis 25.10. im Urlaub')).toBe('urlaub');
    expect(grundOhneKi('Haben uns für eine andere Agentur entschieden')).toBe('kein_interesse');
    expect(grundOhneKi('Termin passt doch nicht')).toBe('sonstiges');
  });
});

describe('planeAbsage', () => {
  it('ohne Grund: sofort Aufgabe, Nachricht nach 2 Std., Zeiten ab morgen', () => {
    const p = planeAbsage('ohne_grund', null, jetzt);
    expect(p.aufgabe).toMatch(/Anrufen/);
    expect(p.nachrichtAm?.toISOString()).toBe('2026-10-16T14:00:00.000Z');
    expect(p.vorschlaegeAb).toBe('2026-10-17');
  });
  it('krank: Nachricht gleich, Zeiten ab nächstem Montag', () => {
    const p = planeAbsage('krank', null, jetzt);
    expect(p.aufgabe).toBeNull();
    expect(p.vorschlaegeAb).toBe('2026-10-19');
  });
  it('Urlaub: Nachricht am Rückkehrtag um 9:30, sonst nach 14 Tagen', () => {
    expect(planeAbsage('urlaub', '2026-10-26', jetzt).nachrichtAm?.toISOString()).toBe('2026-10-26T08:30:00.000Z');
    expect(planeAbsage('urlaub', '2026-10-26', jetzt).vorschlaegeAb).toBe('2026-10-27');
    expect(planeAbsage('urlaub', null, jetzt).nachrichtAm?.toISOString()).toBe('2026-10-30T08:30:00.000Z');
  });
  it('kein Interesse: keine Nachricht', () => {
    const p = planeAbsage('kein_interesse', null, jetzt);
    expect(p.nachrichtAm).toBeNull();
    expect(p.aufgabe).toMatch(/Verlustgrund/);
  });
});

describe('naechsterMontag', () => {
  it('Freitag → Montag in 3 Tagen, Sonntag → morgen, Montag → in 7 Tagen', () => {
    expect(naechsterMontag(jetzt)).toBe('2026-10-19');
    expect(naechsterMontag(new Date('2026-10-18T10:00:00Z'))).toBe('2026-10-19');
    expect(naechsterMontag(new Date('2026-10-19T10:00:00Z'))).toBe('2026-10-26');
  });
});

describe('waehleVorschlaege', () => {
  const slots = [
    '2026-10-16T13:00:00Z', // heute in 1 Std. → zu knapp
    '2026-10-19T07:00:00Z', // Mo 9:00
    '2026-10-19T08:30:00Z', // Mo 10:30
    '2026-10-19T13:00:00Z', // Mo 15:00
    '2026-10-20T07:00:00Z', // Di 9:00
    '2026-10-20T12:30:00Z', // Di 14:30
    '2026-10-21T08:00:00Z',
  ];
  it('zwei Tage: erster ab 10 Uhr, zweiter ab 14 Uhr', () => {
    expect(waehleVorschlaege(slots, '2026-10-17', jetzt)).toEqual(['2026-10-19T08:30:00Z', '2026-10-20T12:30:00Z']);
  });
  it('ohne passende Uhrzeit der erste Slot des Tages', () => {
    expect(waehleVorschlaege(['2026-10-19T06:00:00Z', '2026-10-20T07:00:00Z'], '2026-10-17', jetzt)).toEqual(['2026-10-19T06:00:00Z', '2026-10-20T07:00:00Z']);
  });
  it('keine Slots → leer', () => {
    expect(waehleVorschlaege([], '2026-10-17', jetzt)).toEqual([]);
  });
});

describe('Texte', () => {
  it('morgen / übermorgen / Wochentag', () => {
    expect(zeitText('2026-10-17T08:00:00Z', jetzt)).toBe('morgen um 10:00 Uhr');
    expect(zeitText('2026-10-18T12:30:00Z', jetzt)).toBe('übermorgen um 14:30 Uhr');
    expect(zeitText('2026-10-20T08:00:00Z', jetzt)).toBe('Dienstag (20.10.) um 10:00 Uhr');
  });
  it('krank mit zwei Zeiten', () => {
    expect(baueSatz('krank', ['2026-10-19T08:30:00Z', '2026-10-20T12:30:00Z'], jetzt)).toBe(
      'Gute Besserung! Lass uns gerne einen neuen Termin für nächste Woche finden. Passt dir Montag (19.10.) um 10:30 Uhr oder Dienstag (20.10.) um 14:30 Uhr?',
    );
  });
  it('ohne freie Zeiten fragt er offen', () => {
    expect(baueSatz('ohne_grund', [], jetzt)).toMatch(/zum Beispiel morgen oder übermorgen\?$/);
    expect(baueSatz('krank', [], jetzt)).toMatch(/Anfang nächster Woche\?$/);
  });
  it('ganze Nachricht', () => {
    expect(nachrichtText('Mehmet', 'Kein Problem.')).toMatch(/^Hallo Mehmet, ich habe gesehen, dass du unser Gespräch absagen musstest\. Kein Problem\.\n\nSchreib mir/);
  });
});
