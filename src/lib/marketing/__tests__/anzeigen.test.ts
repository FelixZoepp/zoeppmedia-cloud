import { describe, expect, it } from 'vitest';
import { bewerte, normName } from '../anzeigen';

describe('Anzeigen bewerten', () => {
  it('Gewinner, Verlierer, Test', () => {
    expect(bewerte({ ausgaben: 300, leads: 6, cpl: 50 }, 100).status).toBe('gewinner');
    expect(bewerte({ ausgaben: 300, leads: 2, cpl: 150 }, 100).status).toBe('verlierer');
    expect(bewerte({ ausgaben: 250, leads: 0, cpl: null }, 100).status).toBe('verlierer');
    expect(bewerte({ ausgaben: 60, leads: 0, cpl: null }, 100).status).toBe('test');
    expect(bewerte({ ausgaben: 0, leads: 0, cpl: null }, 100).status).toBe('ohne_daten');
    expect(bewerte({ ausgaben: 100, leads: 1, cpl: 100 }, null).status).toBe('test');
  });

  it('Anzeigenname ↔ utm_content', () => {
    expect(normName('250 Pro Partner')).toBe(normName('250propartner'));
  });
});
