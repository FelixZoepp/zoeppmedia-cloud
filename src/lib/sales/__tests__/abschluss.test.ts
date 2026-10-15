import { describe, expect, it } from 'vitest';
import { gleicherName, wertText } from '../abschluss';

describe('Abschluss nachziehen', () => {
  it('Auftragswert lesbar (Close speichert Cent)', () => {
    expect(wertText(720000, 'one_time')).toBe('7.200 € einmalig');
    expect(wertText(100000, 'monthly')).toBe('1.000 € monatlich');
    expect(wertText(0, 'monthly')).toBeNull();
    expect(wertText(null, null)).toBeNull();
  });

  it('erkennt denselben Kunden trotz Rechtsform und Schreibweise', () => {
    expect(gleicherName('Nova Reach GmbH', 'Nova Reach')).toBe(true);
    expect(gleicherName('nova-reach', 'Nova Reach UG (haftungsbeschränkt)')).toBe(true);
    expect(gleicherName('Hoffmann Solutions', 'Nova Reach')).toBe(false);
    expect(gleicherName('', 'Nova Reach')).toBe(false);
  });
});
