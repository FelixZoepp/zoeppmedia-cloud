import { describe, it, expect } from 'vitest';
import { alarmBeiWechsel, berechneAmpel, faelligeFristen, garantieZeitraum, plusMonate } from '../ampel';

const start = new Date('2026-01-01T00:00:00Z');
const ende = new Date('2026-07-01T00:00:00Z'); // ~181 Tage
const am = (iso: string) => new Date(iso);

describe('berechneAmpel', () => {
  it('ohne Ziel oder Start: offen', () => {
    expect(berechneAmpel({ start: null, ende: null, ziel: 10, ist: 0, now: am('2026-03-01T00:00:00Z') }).ampel).toBe('offen');
    expect(berechneAmpel({ start, ende, ziel: null, ist: 0, now: am('2026-03-01T00:00:00Z') }).ampel).toBe('offen');
  });

  it('in den ersten 14 Tagen: Anlauf', () => {
    expect(berechneAmpel({ start, ende, ziel: 10, ist: 0, now: am('2026-01-10T00:00:00Z') }).ampel).toBe('anlauf');
  });

  it('bewertet Fortschritt gegen die verstrichene Zeit', () => {
    const halb = am('2026-04-01T12:00:00Z'); // 50 % der Zeit
    expect(berechneAmpel({ start, ende, ziel: 10, ist: 5, now: halb }).ampel).toBe('gruen');
    expect(berechneAmpel({ start, ende, ziel: 10, ist: 4, now: halb }).ampel).toBe('gelb');
    expect(berechneAmpel({ start, ende, ziel: 10, ist: 2, now: halb }).ampel).toBe('rot');
  });

  it('Ziel erreicht schlägt alles, abgelaufen ohne Ziel ist rot', () => {
    expect(berechneAmpel({ start, ende, ziel: 10, ist: 10, now: am('2026-01-05T00:00:00Z') }).ampel).toBe('erreicht');
    expect(berechneAmpel({ start, ende, ziel: 10, ist: 9, now: am('2026-08-01T00:00:00Z') }).ampel).toBe('rot');
  });
});

describe('alarmBeiWechsel – einmal je Stufe', () => {
  it('erster Lauf und gleiche Stufe lösen nichts aus', () => {
    expect(alarmBeiWechsel(null, 'rot')).toBeNull();
    expect(alarmBeiWechsel('rot', 'rot')).toBeNull();
    expect(alarmBeiWechsel('gelb', 'gelb')).toBeNull();
  });
  it('Wechsel nach rot = Aufgabe, nach gelb = Hinweis, Erholung = nichts', () => {
    expect(alarmBeiWechsel('gruen', 'rot')).toBe('aufgabe');
    expect(alarmBeiWechsel('gelb', 'rot')).toBe('aufgabe');
    expect(alarmBeiWechsel('gruen', 'gelb')).toBe('hinweis');
    expect(alarmBeiWechsel('rot', 'gelb')).toBeNull();
    expect(alarmBeiWechsel('rot', 'gruen')).toBeNull();
  });
});

describe('faelligeFristen – Verlängerung', () => {
  it('erster Lauf vermerkt verstrichene Fristen ohne Aufgabe', () => {
    expect(faelligeFristen(20, null)).toEqual({ neu: [], vermerken: [30] });
    expect(faelligeFristen(100, null)).toEqual({ neu: [], vermerken: [] });
  });
  it('löst jede Frist genau einmal aus', () => {
    expect(faelligeFristen(30, [])).toEqual({ neu: [30], vermerken: [30] });
    expect(faelligeFristen(25, [30])).toEqual({ neu: [], vermerken: [] });
    expect(faelligeFristen(14, [30])).toEqual({ neu: [14], vermerken: [14] });
  });
  it('mehrere gleichzeitig fällig: nur die engste als Aufgabe', () => {
    expect(faelligeFristen(10, [])).toEqual({ neu: [14], vermerken: [30, 14] });
  });
  it('Vertrag schon vorbei: nur vermerken', () => {
    expect(faelligeFristen(-3, [])).toEqual({ neu: [], vermerken: [30, 14] });
  });
});

describe('garantieZeitraum', () => {
  it('beginnt mit dem Kampagnenstart und läuft die Vertragslaufzeit', () => {
    const z = garantieZeitraum({ launch_datum: '2026-02-15', laufzeit_monate: 6, garantie_start: '2026-01-01', garantie_ende: '2027-01-01' });
    expect(z.start?.toISOString().slice(0, 10)).toBe('2026-02-15');
    expect(z.ende?.toISOString().slice(0, 10)).toBe('2026-08-15');
  });
  it('ohne Kampagnenstart: kein Zeitraum', () => {
    expect(garantieZeitraum({ launch_datum: null, laufzeit_monate: 6, garantie_start: null, garantie_ende: null })).toEqual({ start: null, ende: null });
  });
  it('plusMonate kappt auf Monatsende', () => {
    expect(plusMonate(new Date('2026-01-31T00:00:00Z'), 1).toISOString().slice(0, 10)).toBe('2026-02-28');
  });
});
