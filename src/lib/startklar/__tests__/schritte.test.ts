import { describe, expect, it } from 'vitest';
import { istDeutscheNummer, werteStartklarAus, type StartklarRohdaten } from '../schritte';

const leer: StartklarRohdaten = {
  onboardingAbgeschlossen: false,
  nutzer: 1,
  teamEinladungen: 0,
  whatsappVerbunden: false,
  outboundPhone: null,
  masterclassGestartet: false,
  anrufe: 0,
};
const alles: StartklarRohdaten = {
  onboardingAbgeschlossen: true,
  nutzer: 3,
  teamEinladungen: 0,
  whatsappVerbunden: true,
  outboundPhone: '+49 30 1234567',
  masterclassGestartet: true,
  anrufe: 12,
};
const erledigt = (d: StartklarRohdaten) => Object.fromEntries(werteStartklarAus(d).schritte.map((s) => [s.key, s.erledigt]));

describe('Startklar-Checkliste', () => {
  it('neuer Kunde: nichts erledigt, Reihenfolge und Links stimmen', () => {
    const s = werteStartklarAus(leer);
    expect(s.erledigt).toBe(0);
    expect(s.gesamt).toBe(6);
    expect(s.prozent).toBe(0);
    expect(s.fertig).toBe(false);
    expect(s.schritte.map((x) => x.key)).toEqual(['onboarding', 'team', 'whatsapp', 'absendernummer', 'masterclass', 'anruf']);
    expect(s.schritte.find((x) => x.key === 'whatsapp')?.href).toBe('/settings/whatsapp');
    expect(s.schritte.find((x) => x.key === 'anruf')?.href).toBe('/anrufen');
    expect(s.schritte.find((x) => x.key === 'absendernummer')?.href).toBeNull();
  });

  it('alles erledigt → fertig (Karte verschwindet)', () => {
    const s = werteStartklarAus(alles);
    expect(s).toMatchObject({ erledigt: 6, prozent: 100, fertig: true });
  });

  it('Team: zweiter Login oder Einladung an Kollegen', () => {
    expect(erledigt(leer).team).toBe(false);
    expect(erledigt({ ...leer, nutzer: 2 }).team).toBe(true);
    expect(erledigt({ ...leer, nutzer: 0, teamEinladungen: 1 }).team).toBe(true);
  });

  it('Absendernummer nur mit deutscher Nummer', () => {
    expect(erledigt({ ...leer, outboundPhone: '+4915112345678' }).absendernummer).toBe(true);
    expect(erledigt({ ...leer, outboundPhone: '+43 660 1234567' }).absendernummer).toBe(false);
    expect(erledigt({ ...leer, outboundPhone: '030 1234567' }).absendernummer).toBe(false);
    expect(istDeutscheNummer('')).toBe(false);
    expect(istDeutscheNummer('+49')).toBe(false);
  });

  it('Prozent wird gerundet', () => {
    const s = werteStartklarAus({ ...leer, onboardingAbgeschlossen: true, anrufe: 1 });
    expect(s.erledigt).toBe(2);
    expect(s.prozent).toBe(33);
    expect(erledigt({ ...leer, anrufe: 1 }).anruf).toBe(true);
  });
});
