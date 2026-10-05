import { describe, it, expect } from 'vitest';
import { displayTemplateBody, friendlyWhatsAppError, orderedParams, placeholderCount } from '../template-text';

describe('Vorlagen-Text', () => {
  it('zählt Platzhalter aus dem Text', () => {
    expect(placeholderCount('Hallo {{1}}, heute um {{3}} Uhr, {{2}}')).toBe(3);
    expect(placeholderCount('Ohne Platzhalter')).toBe(0);
    expect(placeholderCount(null)).toBe(0);
  });
  it('ordnet Werte nach Nummer', () => {
    expect(orderedParams({ '2': 'B', '1': ' A ' }, 3)).toEqual(['A', 'B', '']);
  });
  it('zeigt bei alten Nachrichten den Vorlagentext statt des Namens', () => {
    const map = new Map([['setting_buchung', 'Hallo {{1}}, wir telefonieren um {{2}} Uhr.']]);
    expect(displayTemplateBody('setting_buchung', map)).toBe('Hallo …, wir telefonieren um … Uhr.');
    expect(displayTemplateBody('Hallo Max, bis morgen', map)).toBe('Hallo Max, bis morgen');
    expect(displayTemplateBody('unbekannte_vorlage', map)).toBe('unbekannte_vorlage');
  });
  it('macht Meta-Fehler verständlich', () => {
    const raw = 'WhatsApp API Fehler 400: {"error":{"message":"(#132000) Number of parameters does not match the expected number of params","code":132000}}';
    expect(friendlyWhatsAppError(raw)).toMatch(/Platzhalter/);
    expect(friendlyWhatsAppError('{"error":{"message":"Irgendwas anderes","code":1}}')).toBe('WhatsApp: Irgendwas anderes');
    expect(friendlyWhatsAppError(null)).toBeNull();
    expect(friendlyWhatsAppError('Telefonnummer fehlt')).toBe('Telefonnummer fehlt');
  });
});
