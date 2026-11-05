import { describe, expect, it } from 'vitest';
import { absageCodeFuerStatus, anrufErgebnis, anrufNotiz, lisaQuelle, phaseFuerStatus, pruefeLisaSignatur, signiere } from '../protokoll';

describe('Lisa-Signatur', () => {
  const secret = 'lisa_whsec_test';
  const body = '{"id":"dlv_1","type":"call.completed"}';
  it('gültige Signatur wird akzeptiert', () => {
    const t = 1_762_074_000;
    expect(pruefeLisaSignatur(secret, body, signiere(secret, body, t), t + 10)).toBe(true);
  });
  it('falsches Secret, veränderter Body, zu alt oder fehlend → abgelehnt', () => {
    const t = 1_762_074_000;
    const h = signiere(secret, body, t);
    expect(pruefeLisaSignatur('anders', body, h, t)).toBe(false);
    expect(pruefeLisaSignatur(secret, body + ' ', h, t)).toBe(false);
    expect(pruefeLisaSignatur(secret, body, h, t + 301)).toBe(false);
    expect(pruefeLisaSignatur(secret, body, null, t)).toBe(false);
    expect(pruefeLisaSignatur(secret, body, 't=abc,v1=00', t)).toBe(false);
  });
});

describe('Zuordnung', () => {
  it('Quelle', () => {
    expect(lisaQuelle('meta_lead')).toBe('meta');
    expect(lisaQuelle('perspective')).toBe('meta');
    expect(lisaQuelle('indeed')).toBe('indeed');
    expect(lisaQuelle('form')).toBe('website');
    expect(lisaQuelle(null)).toBe('other');
  });
  it('Anruf-Ergebnis', () => {
    expect(anrufErgebnis({ outcome: 'no_answer' })).toBe('nicht_erreicht');
    expect(anrufErgebnis({ outcome: 'voicemail', result: 'termin' })).toBe('nicht_erreicht');
    expect(anrufErgebnis({ outcome: 'reached', result: 'termin' })).toBe('termin_vereinbart');
    expect(anrufErgebnis({ outcome: 'reached', result: 'keine_zeit' })).toBe('rueckruf');
    expect(anrufErgebnis({ outcome: 'reached', result: 'selbst_abgelehnt' })).toBe('kein_interesse');
    expect(anrufErgebnis({ outcome: 'reached', result: 'falsche_person' })).toBe('falsche_nummer');
    expect(anrufErgebnis({ outcome: 'reached', result: 'minderjaehrig' })).toBe('sonstiges');
  });
  it('Notiz enthält Versuch, Ergebnis, Zusammenfassung und Antworten', () => {
    const n = anrufNotiz({ attempt_no: 2, outcome: 'reached', result: 'termin', summary: 'Hat Führerschein, ab sofort verfügbar.', answers: { fuehrerschein: 'ja', start: 'sofort' } });
    expect(n).toContain('🤖 Hiring Lisa · Versuch 2 · erreicht · Termin vereinbart');
    expect(n).toContain('Hat Führerschein');
    expect(n).toContain('• fuehrerschein: ja');
    expect(anrufNotiz({ outcome: 'no_answer' })).toBe('🤖 Hiring Lisa · nicht abgenommen');
  });
  it('Phase und Absagegrund', () => {
    expect(phaseFuerStatus('termin')).toBe('interview');
    expect(phaseFuerStatus('selbst_abgelehnt')).toBe('rejected');
    expect(phaseFuerStatus('nicht_erreicht')).toBeNull();
    expect(absageCodeFuerStatus('minderjaehrig')).toBe('unter_18');
    expect(absageCodeFuerStatus('termin')).toBeNull();
  });
});
