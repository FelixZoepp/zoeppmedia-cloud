import { describe, expect, it } from 'vitest';
import { twilioRestConfig } from '../config';
import {
  STANDARD_VORWAHL,
  bereinigeVorwahl,
  bundleStatus,
  codeEmpfangOffen,
  extrahiereCode,
  istDeutscheNummer,
  kaufGrund,
  nummerAnzeigen,
  vorschlagVorwahl,
  vorwahlAusPlz,
  vorwahlAusTelefon,
  type KaufVoraussetzungen,
} from '../nummer';
import { twimlCodeHoeren } from '../twiml';

describe('extrahiereCode', () => {
  it('liest Codes aus SMS', () => {
    expect(extrahiereCode('<#> Dein WhatsApp Business-Code: 123-456. Teile diesen Code mit niemandem.')).toBe('123456');
    expect(extrahiereCode('Your WhatsApp code 987654')).toBe('987654');
    expect(extrahiereCode('Code 12345 eingeben')).toBe('12345');
  });
  it('liest gesprochene Ziffern (deutsch und englisch)', () => {
    expect(extrahiereCode('Ihr Code lautet eins zwei drei vier fünf sechs')).toBe('123456');
    expect(extrahiereCode('your code is one, two, three, four, five, six')).toBe('123456');
    expect(extrahiereCode('Ihr Bestätigungscode ist 4 0 7 1 9 2. Ich wiederhole: 4 0 7 1 9 2')).toBe('407192');
    expect(extrahiereCode('Zwo null acht fuenf neun sieben')).toBe('208597');
  });
  it('erkennt direkt wiederholte Codes', () => {
    expect(extrahiereCode('123456 123456')).toBe('123456');
    expect(extrahiereCode('1 2 3 4 5 6. 1 2 3 4 5 6.')).toBe('123456');
  });
  it('liefert null ohne eindeutigen Code', () => {
    expect(extrahiereCode('')).toBeNull();
    expect(extrahiereCode(null)).toBeNull();
    expect(extrahiereCode('Hallo, wer ist da?')).toBeNull();
    expect(extrahiereCode('Rufen Sie +49 30 1234567 an')).toBeNull();
    expect(extrahiereCode('Code 1234')).toBeNull();
    expect(extrahiereCode('Nummer 1234567890')).toBeNull();
  });
});

describe('Vorwahl', () => {
  it('bereinigt Eingaben', () => {
    expect(bereinigeVorwahl('030')).toBe('30');
    expect(bereinigeVorwahl('+49 89')).toBe('89');
    expect(bereinigeVorwahl('0221')).toBe('221');
    expect(bereinigeVorwahl('0171')).toBeNull();
    expect(bereinigeVorwahl('0800')).toBeNull();
    expect(bereinigeVorwahl('032')).toBeNull();
    expect(bereinigeVorwahl('abc')).toBeNull();
    expect(bereinigeVorwahl('')).toBeNull();
  });
  it('liest das Ortsnetz aus Festnetznummern', () => {
    expect(vorwahlAusTelefon('030 1234567')).toEqual({ vorwahl: '30', ort: 'Berlin', quelle: 'telefon' });
    expect(vorwahlAusTelefon('+49 221 987654')?.ort).toBe('Köln');
    expect(vorwahlAusTelefon('06131-123456')?.vorwahl).toBe('6131');
    expect(vorwahlAusTelefon('0171 1234567')).toBeNull();
    expect(vorwahlAusTelefon('+43 1 234567')).toBeNull();
    expect(vorwahlAusTelefon('04533 12345')).toBeNull(); // unbekanntes Ortsnetz → kein Raten
    expect(vorwahlAusTelefon(null)).toBeNull();
  });
  it('leitet aus der PLZ ab', () => {
    expect(vorwahlAusPlz('10115')?.vorwahl).toBe('30');
    expect(vorwahlAusPlz('80331')?.ort).toBe('München');
    expect(vorwahlAusPlz('01067')?.vorwahl).toBe('351');
    expect(vorwahlAusPlz('99999')).toBeNull();
    expect(vorwahlAusPlz('123')).toBeNull();
  });
  it('schlägt in der richtigen Reihenfolge vor', () => {
    expect(vorschlagVorwahl({ telefone: ['0171 111111', '089 123456'], plz: '10115' })).toEqual({ vorwahl: '89', ort: 'München', quelle: 'telefon' });
    expect(vorschlagVorwahl({ telefone: ['0171 111111'], plz: '50667' })).toEqual({ vorwahl: '221', ort: 'Köln', quelle: 'plz' });
    expect(vorschlagVorwahl({})).toEqual(STANDARD_VORWAHL);
  });
  it('zeigt Nummern lesbar an', () => {
    expect(nummerAnzeigen('+4930123456')).toBe('+49 30 123456');
    expect(nummerAnzeigen('+4945331234')).toBe('+4945331234');
    expect(nummerAnzeigen(null)).toBe('');
  });
});

describe('Unterlagen und Kauf', () => {
  it('übersetzt den Bundle-Status', () => {
    expect(bundleStatus('twilio-approved')).toEqual({ label: 'Freigegeben', ton: 'success', kaufbar: true });
    expect(bundleStatus('pending-review').kaufbar).toBe(false);
    expect(bundleStatus('twilio-rejected').ton).toBe('danger');
    expect(bundleStatus('draft').kaufbar).toBe(false);
    expect(bundleStatus(null).label).toBe('Keine Unterlagen');
  });
  const ok: KaufVoraussetzungen = { twilioBereit: true, schemaBereit: true, freigegeben: true, unterkonto: true, schonGekauft: false, bundle: 'twilio-approved', adresse: true, bestaetigt: true };
  it('erlaubt den Kauf nur, wenn alles erfüllt ist', () => {
    expect(kaufGrund(ok)).toBeNull();
    expect(kaufGrund({ ...ok, twilioBereit: false })).toBe('Twilio ist noch nicht eingerichtet');
    expect(kaufGrund({ ...ok, schemaBereit: false })).toBe('Datenbank-Änderung fehlt noch');
    expect(kaufGrund({ ...ok, freigegeben: false })).toMatch(/nicht freigegeben/);
    expect(kaufGrund({ ...ok, schonGekauft: true })).toMatch(/schon eine Nummer/);
    expect(kaufGrund({ ...ok, bundle: 'pending-review' })).toMatch(/Unterlagen/);
    expect(kaufGrund({ ...ok, adresse: false })).toMatch(/Adresse/);
    expect(kaufGrund({ ...ok, bestaetigt: false })).toMatch(/bestätigen/);
  });
  it('prüft deutsche Nummern', () => {
    expect(istDeutscheNummer('+4930123456')).toBe(true);
    expect(istDeutscheNummer('+4917012345678')).toBe(false);
    expect(istDeutscheNummer('+12025550123')).toBe(false);
    expect(istDeutscheNummer(42)).toBe(false);
  });
  it('kennt das Code-Fenster', () => {
    const jetzt = Date.parse('2026-10-15T10:00:00Z');
    expect(codeEmpfangOffen('2026-10-15T10:05:00Z', jetzt)).toBe(true);
    expect(codeEmpfangOffen('2026-10-15T09:59:00Z', jetzt)).toBe(false);
    expect(codeEmpfangOffen(null, jetzt)).toBe(false);
  });
});

describe('REST-Zugang und TwiML', () => {
  it('braucht nur SID und Token', () => {
    expect(twilioRestConfig({})).toBeNull();
    expect(twilioRestConfig({ TWILIO_ACCOUNT_SID: 'AC1' })).toBeNull();
    expect(twilioRestConfig({ TWILIO_ACCOUNT_SID: ' AC1 ', TWILIO_AUTH_TOKEN: 't' })).toEqual({ accountSid: 'AC1', authToken: 't' });
  });
  it('hört per Spracherkennung mit', () => {
    const x = twimlCodeHoeren({ action: 'https://b/api/twilio/nummer/anruf?schritt=de&x=1', sprache: 'de-DE' });
    expect(x).toContain('<Gather input="speech" language="de-DE"');
    expect(x).toContain('action="https://b/api/twilio/nummer/anruf?schritt=de&amp;x=1"');
    expect(x).not.toContain('<Say');
  });
});
