import { describe, expect, it } from 'vitest';
import { faelligAm, kundeAusTitel } from '../kunde';

const kunden = [
  { id: 'a', name: 'Turhan Vertriebs GmbH', contact_name: 'Cihan Turhan' },
  { id: 'b', name: 'Sales Winner UG', contact_name: 'Max Muster' },
  { id: 'c', name: 'Özdemir', contact_name: null },
];

describe('kundeAusTitel', () => {
  it('findet Firmenname und Ansprechpartner', () => {
    expect(kundeAusTitel('Kick-off Turhan Vertriebs GmbH x Zoepp', kunden)?.id).toBe('a');
    expect(kundeAusTitel('Service-Call mit Cihan Turhan', kunden)).toMatchObject({ id: 'a', feld: 'Ansprechpartner' });
    expect(kundeAusTitel('Onboarding Sales Winner', kunden)?.id).toBe('b');
    expect(kundeAusTitel('Onboarding Özdemir', kunden)?.id).toBe('c');
  });
  it('kein Treffer oder mehrdeutig → null', () => {
    expect(kundeAusTitel('Beratungsgespräch mit Miró Neumann', kunden)).toBeNull();
    expect(kundeAusTitel('Cihan Turhan und Sales Winner Abstimmung', kunden)).toBeNull();
    expect(kundeAusTitel(null, kunden)).toBeNull();
  });
});

describe('faelligAm', () => {
  it('rechnet Frist in Tagen (Berlin) und begrenzt sie', () => {
    const jetzt = new Date('2026-10-14T10:00:00Z');
    expect(faelligAm(jetzt, 0)).toBe('2026-10-14');
    expect(faelligAm(jetzt, 3)).toBe('2026-10-17');
    expect(faelligAm(jetzt, -5)).toBe('2026-10-14');
    expect(faelligAm(jetzt, 365)).toBe('2026-12-13');
  });
});
