import { describe, expect, it } from 'vitest';
import { ersterTermin, naechsterTermin, regelText, wochentagVon } from '../regeln';
import { istTextDiktat } from '../whatsapp-diktat';

describe('Rhythmus-Regeln', () => {
  it('Wochentag: 2026-10-09 ist ein Freitag (5)', () => {
    expect(wochentagVon('2026-10-09')).toBe(5);
  });
  it('täglich (Mo–Fr) überspringt das Wochenende', () => {
    expect(naechsterTermin({ rhythmus: 'taeglich' }, '2026-10-09')).toBe('2026-10-12');
    expect(ersterTermin({ rhythmus: 'taeglich' }, '2026-10-10')).toBe('2026-10-12');
    expect(naechsterTermin({ rhythmus: 'taeglich', nur_werktags: false }, '2026-10-09')).toBe('2026-10-10');
  });
  it('wöchentlich am Montag', () => {
    expect(ersterTermin({ rhythmus: 'woechentlich', wochentag: 1 }, '2026-10-09')).toBe('2026-10-12');
    expect(ersterTermin({ rhythmus: 'woechentlich', wochentag: 5 }, '2026-10-09')).toBe('2026-10-09');
    expect(naechsterTermin({ rhythmus: 'woechentlich', wochentag: 5 }, '2026-10-09')).toBe('2026-10-16');
  });
  it('monatlich: Monatsende und Wochenende auf den Freitag davor', () => {
    expect(ersterTermin({ rhythmus: 'monatlich', monatstag: 31, nur_werktags: false }, '2026-11-01')).toBe('2026-11-30');
    // 01.11.2026 ist ein Sonntag → Freitag läge im Oktober → Montag 02.11.; nie zwei Termine im selben Monat
    expect(ersterTermin({ rhythmus: 'monatlich', monatstag: 1 }, '2026-10-02')).toBe('2026-11-02');
    expect(naechsterTermin({ rhythmus: 'monatlich', monatstag: 1 }, '2026-11-02')).toBe('2026-12-01');
    expect(ersterTermin({ rhythmus: 'monatlich', monatstag: 1 }, '2026-10-31')).toBe('2026-11-02');
    expect(naechsterTermin({ rhythmus: 'monatlich', monatstag: 15 }, '2026-10-15')).toBe('2026-11-13');
  });
  it('ungültige Werte führen nicht in eine Endlosschleife', () => {
    expect(ersterTermin({ rhythmus: 'woechentlich', wochentag: 0 }, '2026-10-09')).toBe('2026-10-12');
    expect(ersterTermin({ rhythmus: 'woechentlich', wochentag: 8 }, '2026-10-09')).toBe('2026-10-12');
    expect(ersterTermin({ rhythmus: 'woechentlich', wochentag: 1.5 }, '2026-10-09')).toBe('2026-10-12');
  });
  it('lesbare Regel', () => {
    expect(regelText({ rhythmus: 'woechentlich', wochentag: 1 })).toBe('Wöchentlich, montags');
    expect(regelText({ rhythmus: 'taeglich' })).toBe('Täglich (Mo–Fr)');
    expect(regelText({ rhythmus: 'monatlich', monatstag: 3 })).toBe('Monatlich am 3.');
  });
});

describe('Text-Diktat per WhatsApp', () => {
  it('erkennt „Aufgabe:“ und „To-do:“', () => {
    expect(istTextDiktat('Aufgabe: Nils soll morgen das Reel schneiden')).toBe('Nils soll morgen das Reel schneiden');
    expect(istTextDiktat('todo - Rechnung an Turhan')).toBe('Rechnung an Turhan');
    expect(istTextDiktat('Hallo, wie geht es?')).toBeNull();
  });
});

describe('Sichtbarkeit der Boards', () => {
  it('Mitarbeiter sehen eigene + Team-Boards, nicht persönliche Boards anderer', async () => {
    const { darfAufgabeSehen, darfBoardSehen } = await import('../boards');
    const nils = { id: 'nils', role: 'employee' };
    const felix = { id: 'felix', role: 'admin' };
    expect(darfBoardSehen({ besitzer_id: null }, nils)).toBe(true);
    expect(darfBoardSehen({ besitzer_id: 'nils' }, nils)).toBe(true);
    expect(darfBoardSehen({ besitzer_id: 'felix' }, nils)).toBe(false);
    expect(darfBoardSehen({ besitzer_id: 'nils' }, felix)).toBe(true);
    const boards = new Map([['b-felix', { besitzer_id: 'felix' }]]);
    expect(darfAufgabeSehen({ board_id: 'b-felix', assigned_to: 'felix', created_by: 'felix' }, boards, nils)).toBe(false);
    expect(darfAufgabeSehen({ board_id: 'b-felix', assigned_to: 'nils', created_by: 'felix' }, boards, nils)).toBe(true);
  });
});
