import { describe, it, expect } from 'vitest';
import { berechneWochenbericht, isoWoche, type WochenberichtEingabe } from '../berechnung';
import { wochenberichtHtml, betreffWochenbericht } from '../email';

const jetzt = new Date('2026-10-12T06:00:00Z'); // Montag
const tageVorher = (t: number, h = 0) => new Date(jetzt.getTime() - t * 864e5 - h * 36e5).toISOString();

function basis(over: Partial<WochenberichtEingabe> = {}): WochenberichtEingabe {
  return {
    firma: 'Turhan Vertriebs GmbH',
    vorname: 'Fadi',
    phase: 'continuity',
    wirBearbeiten: false,
    jetzt,
    kandidaten: [],
    anrufe: [],
    termine: [],
    einstellungen: [],
    geplant: { gespraeche: 0, probetage: 0 },
    kundenAufgaben: [],
    wirErledigt: [],
    wirAlsNaechstes: [],
    fortschritt: null,
    umsaetzeFehlen: false,
    empfehlung: null,
    ...over,
  };
}

const bewerber = (t: number, kontakt: boolean, min = 20) => ({
  created_at: tageVorher(t),
  first_contact_at: kontakt ? tageVorher(t) : null,
  kontaktversuch_am: null,
  ttfc_seconds: kontakt ? min * 60 : null,
  eingang: !kontakt,
});

describe('Wochenbericht', () => {
  it('KW der Vorwoche (Bericht am Montag)', () => {
    expect(isoWoche(new Date('2026-10-11T12:00:00Z'))).toEqual({ kw: 41, jahr: 2026 });
    expect(berechneWochenbericht(basis()).kw).toBe(41);
  });

  it('auf Kurs: Bewerber da, alle schnell kontaktiert, Gespräch geführt', () => {
    const b = berechneWochenbericht(
      basis({
        kandidaten: [1, 2, 3, 4, 5, 6].map((t) => bewerber(t, true)),
        termine: [{ datum: tageVorher(2), status: 'erschienen' }],
        einstellungen: [tageVorher(1)],
      }),
    );
    expect(b.status).toBe('auf_kurs');
    expect(b.ueberschrift).toBe('Du bist auf Kurs');
    expect(b.kennzahlen.find((k) => k.label === 'Neue Bewerber')?.wert).toBe('6');
    expect(b.kennzahlen.find((k) => k.label === 'Einstellungen')?.wert).toBe('1');
  });

  it('kritisch: keine Bewerber in der Woche', () => {
    const b = berechneWochenbericht(basis({ kandidaten: [bewerber(10, true)] }));
    expect(b.status).toBe('kritisch');
    expect(b.punkte[0]).toMatchObject({ stufe: 'rot' });
    expect(b.empfehlung).toBeNull();
  });

  it('kritisch: Bewerber werden nicht angerufen – Ansprache je nachdem, wer bearbeitet', () => {
    const k = [1, 2, 3, 4].map((t) => bewerber(t, false));
    expect(berechneWochenbericht(basis({ kandidaten: k })).punkte.some((p) => p.stufe === 'rot' && p.text.includes('verlorenes Geld'))).toBe(true);
    expect(berechneWochenbericht(basis({ kandidaten: k, wirBearbeiten: true })).punkte.some((p) => p.text.includes('unser Innendienst'))).toBe(true);
  });

  it('Achtung: langsamer Erstkontakt, fehlende Umsätze', () => {
    const b = berechneWochenbericht(basis({ kandidaten: [1, 2, 3].map((t) => bewerber(t, true, 300)), umsaetzeFehlen: true }));
    expect(b.status).toBe('achtung');
    expect(b.punkte.filter((p) => p.stufe === 'gelb').map((p) => p.text).join(' ')).toContain('Umsätze');
    expect(b.ueberschrift).toBe('Auf Kurs, aber 2 Punkte brauchen Aufmerksamkeit');
  });

  it('Aufbau: Fortschritt und überfällige Kunden-Aufgaben', () => {
    const b = berechneWochenbericht(
      basis({
        phase: 'onboarding',
        fortschritt: { erledigt: 6, gesamt: 12 },
        kundenAufgaben: [{ titel: 'Indeed-Zugang gegeben', faellig_am: '2026-10-08' }, { titel: 'Onboarding-Formular', faellig_am: '2026-10-20' }],
        wirErledigt: ['Vertrag unterschrieben'],
      }),
    );
    expect(b.modus).toBe('aufbau');
    expect(b.status).toBe('achtung');
    expect(b.kennzahlen[0]).toEqual({ label: 'Fortschritt bis zum Start', wert: '50 %', vorwoche: null });
    expect(b.deineAufgaben).toEqual(['Indeed-Zugang gegeben (überfällig)', 'Onboarding-Formular']);
  });

  it('E-Mail: Betreff mit Status, Inhalte escaped', () => {
    const b = berechneWochenbericht(basis({ firma: '<b>X</b>', kandidaten: [bewerber(1, true)] }));
    expect(betreffWochenbericht(b)).toContain('KW 41');
    const html = wochenberichtHtml(b, 'https://cloud.zoeppmedia.de/reports');
    expect(html).toContain('&lt;b&gt;X&lt;/b&gt;');
    expect(html).not.toContain('<b>X</b>');
  });
});
