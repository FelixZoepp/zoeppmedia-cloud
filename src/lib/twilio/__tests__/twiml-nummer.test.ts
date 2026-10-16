import { describe, expect, it } from 'vitest';
import { twimlCodeEintippen, twimlWeiterleiten } from '../twiml';

describe('Kundennummer: Prüfanruf und Weiterleitung', () => {
  it('tippt nur Ziffern ein', () => {
    expect(twimlCodeEintippen('12 34-56')).toContain('<Play digits="123456"/>');
  });
  it('leitet weiter und zeigt die Bewerbernummer', () => {
    const x = twimlWeiterleiten({ an: '+491711234567', anrufer: '+4915112345678' });
    expect(x).toContain('callerId="+4915112345678"');
    expect(x).toContain('<Number>+491711234567</Number>');
  });
  it('ohne gültige Anrufernummer kein callerId', () => {
    expect(twimlWeiterleiten({ an: '+491711234567', anrufer: 'anonymous' })).not.toContain('callerId');
  });
});
