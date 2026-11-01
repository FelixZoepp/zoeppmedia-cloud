import { describe, it, expect } from 'vitest';
import { noShowPunktWechsel } from '../noshow-wechsel';

describe('noShowPunktWechsel', () => {
  it('vergibt nur beim Wechsel auf no_show einen Punkt', () => {
    expect(noShowPunktWechsel('geplant', 'no_show')).toBe(1);
    expect(noShowPunktWechsel(null, 'no_show')).toBe(1);
  });
  it('erneutes Setzen auf no_show vergibt keinen weiteren Punkt', () => {
    expect(noShowPunktWechsel('no_show', 'no_show')).toBe(0);
  });
  it('Zurücksetzen von no_show zieht den Punkt wieder ab', () => {
    expect(noShowPunktWechsel('no_show', 'erschienen')).toBe(-1);
    expect(noShowPunktWechsel('no_show', 'geplant')).toBe(-1);
  });
  it('andere Wechsel oder kein Status ändern nichts', () => {
    expect(noShowPunktWechsel('geplant', 'erschienen')).toBe(0);
    expect(noShowPunktWechsel('no_show', undefined)).toBe(0);
  });
});
