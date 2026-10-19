import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/freigaben', () => ({ istFreigegeben: vi.fn() }));
import { regelnUpsell, werteNachSchluessel } from '../upsell-protokoll';

const jetzt = new Date('2026-10-19T10:00:00Z');
const w = (x: Record<string, string | null>) => ({ erreicht: 'Ja', zufrieden: 'Sehr (Ergebnisse top)', ...x });

describe('regelnUpsell', () => {
  it('Termine → Stufe + Chance', () => {
    expect(regelnUpsell(w({ ergebnis: 'Strategietermin gelegt' }), jetzt)).toMatchObject({ stufe: 'strategietermin', chance: 25, neuAnlegen: true });
    expect(regelnUpsell(w({ ergebnis: 'Konzepttermin gelegt' }), jetzt)).toMatchObject({ stufe: 'konzept', chance: 40 });
    const e = regelnUpsell(w({ ergebnis: 'Entscheidungstermin gelegt', entscheider: 'Nein' }), jetzt, 'B&C');
    expect(e).toMatchObject({ stufe: 'entscheidung', chance: 45 });
    expect(e.aufgaben[0].text).toMatch(/fehlende Entscheider/);
  });
  it('Wert wird übernommen (monatlich)', () => {
    expect(regelnUpsell(w({ ergebnis: 'Konzepttermin gelegt', wert: '6000', wertArt: 'Monatlich' }), jetzt).wert).toEqual({ euro: 6000, monatlich: true });
  });
  it('Abgeschlossen → gewonnen, ohne Wert Aufgabe', () => {
    const p = regelnUpsell(w({ ergebnis: 'Abgeschlossen' }), jetzt, 'OCEC');
    expect(p).toMatchObject({ stufe: 'gewonnen', abgeschlossen: true, sperreAufheben: true });
    expect(p.aufgaben[0].text).toBe('💰 Upsell OCEC: Auftragswert in den Deal eintragen');
    expect(regelnUpsell(w({ ergebnis: 'Abgeschlossen', wert: '72000' }), jetzt).aufgaben).toEqual([]);
  });
  it('Kein Potenzial → verloren + Wiedervorlage in 3 Monaten', () => {
    const p = regelnUpsell(w({ ergebnis: 'Kein Potenzial jetzt' }), jetzt);
    expect(p.stufe).toBe('verloren');
    expect(p.gesperrtBis).toBe('2027-01-19T08:00:00.000Z');
    expect(p.aufgaben[0].datum).toBe('2027-01-19');
  });
  it('nicht erreicht / No-Show / unzufrieden', () => {
    expect(regelnUpsell(w({ erreicht: 'Nein / Mailbox', ergebnis: 'Strategietermin gelegt' }), jetzt)).toMatchObject({ gesperrtBis: '2026-10-20T10:00:00.000Z' });
    expect(regelnUpsell(w({ erreicht: 'No-Show' }), jetzt).aufgaben[0].text).toMatch(/No-Show/);
    expect(regelnUpsell(w({ zufrieden: 'Unzufrieden', ergebnis: 'Verschoben', kalender: '2026-10-25T10:00:00Z' }), jetzt).aufgaben.map((a) => a.text)).toEqual([
      expect.stringMatching(/unzufrieden/),
    ]);
  });
  it('Werte nach Schlüssel', () => {
    expect(werteNachSchluessel({ cf_a: 'Abgeschlossen' }, { typ: 't', felder: { ergebnis: 'cf_a', wert: 'cf_b' } })).toEqual({ ergebnis: 'Abgeschlossen', wert: null });
  });
});
