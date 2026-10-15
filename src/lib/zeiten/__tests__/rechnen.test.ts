import { describe, expect, it } from 'vitest';
import {
  csv,
  dauerFormat,
  dauerParsen,
  eintragMinuten,
  istUeberlang,
  kosten,
  monatAuswerten,
  monatsGrenzen,
  nachtragStart,
  stundensatzAusWert,
  summeAb,
  ueberschneidungen,
  type Zeiteintrag,
} from '../rechnen';

let n = 0;
function e(teil: Partial<Zeiteintrag> & { start: string; ende: string | null }): Zeiteintrag {
  const minuten = teil.ende ? Math.floor((Date.parse(teil.ende) - Date.parse(teil.start)) / 60_000) : null;
  return { id: `e${++n}`, user_id: 'u1', agency_id: 'a1', taetigkeit: 'support', notiz: null, minuten, ...teil };
}

describe('dauerParsen', () => {
  it('versteht hh:mm, Dezimalstunden und Einheiten', () => {
    expect(dauerParsen('1:30')).toBe(90);
    expect(dauerParsen('01:05')).toBe(65);
    expect(dauerParsen('1,5')).toBe(90);
    expect(dauerParsen('0.25')).toBe(15);
    expect(dauerParsen('2h')).toBe(120);
    expect(dauerParsen('45m')).toBe(45);
    expect(dauerParsen('45')).toBe(45); // > 16 → Minuten
    expect(dauerParsen('8')).toBe(480); // ≤ 16 → Stunden
  });
  it('lehnt Unsinn, 0 und zu lange Dauer ab', () => {
    expect(dauerParsen('')).toBeNull();
    expect(dauerParsen('abc')).toBeNull();
    expect(dauerParsen('0:00')).toBeNull();
    expect(dauerParsen('1:75')).toBeNull();
    expect(dauerParsen('17:00')).toBeNull();
  });
});

describe('Dauer und Kosten', () => {
  it('formatiert h:mm', () => {
    expect(dauerFormat(0)).toBe('0:00');
    expect(dauerFormat(95)).toBe('1:35');
    expect(dauerFormat(600)).toBe('10:00');
  });
  it('rechnet Kosten auf Cent', () => {
    expect(kosten(90, 35)).toBe(52.5);
    expect(kosten(20, 35)).toBe(11.67);
  });
  it('Stundensatz: Komma, ungültig → 35', () => {
    expect(stundensatzAusWert('42,5')).toBe(42.5);
    expect(stundensatzAusWert('')).toBe(35);
    expect(stundensatzAusWert(null)).toBe(35);
    expect(stundensatzAusWert('-3')).toBe(35);
  });
  it('laufende Stoppuhr zählt bis jetzt und wird nach 10 h markiert', () => {
    const jetzt = new Date('2026-10-15T20:00:00Z');
    const lauf = e({ start: '2026-10-15T09:00:00Z', ende: null });
    expect(eintragMinuten(lauf, jetzt)).toBe(660);
    expect(istUeberlang(lauf, jetzt)).toBe(true);
    expect(istUeberlang(e({ start: '2026-10-15T09:00:00Z', ende: '2026-10-15T17:00:00Z' }), jetzt)).toBe(false);
  });
});

describe('nachtragStart', () => {
  it('nimmt die angegebene Uhrzeit (Berlin, Sommerzeit)', () => {
    expect(nachtragStart('2026-10-15', '14:30', [])).toBe('2026-10-15T12:30:00.000Z');
  });
  it('ohne Uhrzeit: 09:00 Uhr bzw. direkt nach dem letzten Eintrag des Tages', () => {
    expect(nachtragStart('2026-12-01', null, [])).toBe('2026-12-01T08:00:00.000Z');
    const vorher = [e({ start: '2026-12-01T08:00:00Z', ende: '2026-12-01T10:15:00Z' })];
    expect(nachtragStart('2026-12-01', '', vorher)).toBe('2026-12-01T10:15:00.000Z');
  });
  it('ungültige Eingaben → null', () => {
    expect(nachtragStart('2026-02-31', null, [])).toBeNull();
    expect(nachtragStart('2026-10-15', '25:00', [])).toBeNull();
  });
});

describe('ueberschneidungen', () => {
  it('findet überlappende Einträge desselben Mitarbeiters', () => {
    const a = e({ start: '2026-10-15T08:00:00Z', ende: '2026-10-15T10:00:00Z' });
    const b = e({ start: '2026-10-15T09:30:00Z', ende: '2026-10-15T11:00:00Z' });
    const c = e({ start: '2026-10-15T11:00:00Z', ende: '2026-10-15T12:00:00Z' }); // grenzt nur an
    const d = e({ start: '2026-10-15T09:00:00Z', ende: '2026-10-15T09:45:00Z', user_id: 'u2' }); // anderer Mitarbeiter
    expect([...ueberschneidungen([c, b, a, d])].sort()).toEqual([a.id, b.id].sort());
  });
  it('erkennt Einträge innerhalb eines langen Eintrags', () => {
    const lang = e({ start: '2026-10-15T08:00:00Z', ende: '2026-10-15T16:00:00Z' });
    const kurz1 = e({ start: '2026-10-15T09:00:00Z', ende: '2026-10-15T09:30:00Z' });
    const kurz2 = e({ start: '2026-10-15T12:00:00Z', ende: '2026-10-15T12:30:00Z' });
    expect(ueberschneidungen([lang, kurz1, kurz2]).size).toBe(3);
  });
});

describe('monatsGrenzen', () => {
  it('Berliner Monatsgrenzen in UTC (Winter/Sommer)', () => {
    expect(monatsGrenzen('2026-10')).toEqual({ ab: '2026-09-30T22:00:00.000Z', bis: '2026-10-31T23:00:00.000Z' });
    expect(monatsGrenzen('2026-12')).toEqual({ ab: '2026-11-30T23:00:00.000Z', bis: '2026-12-31T23:00:00.000Z' });
    expect(() => monatsGrenzen('2026-13')).toThrow();
  });
});

describe('monatAuswerten', () => {
  it('summiert je Mitarbeiter und Kunde, laufende zählen nicht', () => {
    const jetzt = new Date('2026-10-20T12:00:00Z');
    const liste = [
      e({ start: '2026-10-01T08:00:00Z', ende: '2026-10-01T09:30:00Z' }), // u1, a1, 90
      e({ start: '2026-10-02T08:00:00Z', ende: '2026-10-02T08:30:00Z', user_id: 'u2', taetigkeit: 'anrufe' }), // u2, a1, 30
      e({ start: '2026-10-03T08:00:00Z', ende: '2026-10-03T09:00:00Z', agency_id: null, taetigkeit: 'intern' }), // u1, intern, 60
      e({ start: '2026-10-20T11:00:00Z', ende: null }), // läuft
    ];
    const r = monatAuswerten(liste, 40, jetzt);
    expect(r.gesamt).toEqual({ minuten: 180, kosten: 120, eintraege: 3 });
    expect(r.laufend).toBe(1);
    expect(r.zuPruefen).toBe(0);
    expect(r.proKunde.map((k) => [k.agencyId, k.minuten, k.kosten])).toEqual([
      ['a1', 120, 80],
      [null, 60, 40],
    ]);
    expect(r.proKunde[0].proTaetigkeit).toEqual({ support: 90, anrufe: 30 });
    expect(r.proMitarbeiter.map((m) => [m.userId, m.minuten])).toEqual([
      ['u1', 150],
      ['u2', 30],
    ]);
  });
  it('summeAb zählt laufende mit', () => {
    const jetzt = new Date('2026-10-15T10:00:00Z');
    const liste = [
      e({ start: '2026-10-11T08:00:00Z', ende: '2026-10-11T09:00:00Z' }),
      e({ start: '2026-10-13T08:00:00Z', ende: '2026-10-13T09:00:00Z' }),
      e({ start: '2026-10-15T09:30:00Z', ende: null }),
    ];
    expect(summeAb(liste, new Date('2026-10-12T00:00:00Z'), jetzt)).toBe(90);
  });
});

describe('csv', () => {
  it('Semikolon, Dezimalkomma, Anführungszeichen, BOM', () => {
    const out = csv(['Kunde', 'Stunden'], [['Müller; Söhne', 1.5], ['Sag "Hallo"', 2]]);
    expect(out).toBe('﻿Kunde;Stunden\r\n"Müller; Söhne";1,5\r\n"Sag ""Hallo""";2\r\n');
  });
});
