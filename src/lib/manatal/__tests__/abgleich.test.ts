import { describe, it, expect } from 'vitest';
import { manatalTelefon, manatalQuelle, schlageKundenVor } from '../abgleich';
import { normalizePhoneE164 } from '@/lib/phone';

describe('Manatal: Telefonnummern', () => {
  it('erkennt Ländervorwahl ohne Plus', () => {
    expect(manatalTelefon('4915112345678')).toBe('+4915112345678');
    expect(normalizePhoneE164(manatalTelefon('491701234567'))).toBe('+491701234567');
  });
  it('lässt 0049 und 0… für die normale Umwandlung', () => {
    expect(normalizePhoneE164(manatalTelefon('004915112345678'))).toBe('+4915112345678');
    expect(normalizePhoneE164(manatalTelefon('0151 1234 5678'))).toBe('+4915112345678');
  });
  it('leer bleibt leer', () => {
    expect(manatalTelefon(null)).toBeNull();
    expect(manatalTelefon('  ')).toBeNull();
  });
});

describe('Manatal: Quelle', () => {
  it('Indeed-Portal → indeed, sonst form', () => {
    expect(manatalQuelle({ source_details: { portal: { display_name: 'Indeed' } } })).toBe('indeed');
    expect(manatalQuelle({ source_details: null })).toBe('form');
  });
});

describe('Manatal: Kunden-Vorschlag über den Namen', () => {
  const kunden = [
    { id: 'e66b016b-7c1f-439f-990b-201ca8a61571', name: 'B&C Direct Sales' },
    { id: 'turhan', name: 'Turhan Vertriebs GmbH' },
    { id: 'roenne', name: 'Rönnefahrt UG' },
    { id: 'sw', name: 'Sales Winner UG' },
    { id: 'sf', name: 'Sales Fokus' },
  ];
  it('erkennt gleiche Namen trotz Rechtsform', () => {
    expect(schlageKundenVor('Turhan Vertriebs GmbH', kunden)).toBe('turhan');
    expect(schlageKundenVor('Rönnefahrt UG (haftungsbeschränkt)', kunden)).toBe('roenne');
  });
  it('schlägt B&C nie vor (läuft über die B&C-Cloud)', () => {
    expect(schlageKundenVor('B&C Direct Sales GmbH', kunden)).toBeNull();
  });
  it('kein Vorschlag bei mehreren oder keinem Treffer', () => {
    expect(schlageKundenVor('Sales', kunden)).toBeNull();
    expect(schlageKundenVor('Unbekannt GmbH', kunden)).toBeNull();
  });
});
