import { describe, it, expect } from 'vitest';
import { generateSlug } from '../slug';

describe('generateSlug', () => {
  it('wandelt Titel in Slug um', () => {
    expect(generateSlug('Vertriebsmitarbeiter (D2D)')).toBe('vertriebsmitarbeiter-d2d');
  });
  it('entfernt Sonderzeichen', () => {
    expect(generateSlug('Außendienst & Verkauf!')).toBe('aussendienst-verkauf');
  });
  it('trimmt Bindestriche', () => {
    expect(generateSlug('---Test---')).toBe('test');
  });
  it('behandelt Umlaute', () => {
    expect(generateSlug('Bürokaufmann/frau')).toBe('buerokaufmann-frau');
  });
  it('gibt fallback bei leerem Input', () => {
    expect(generateSlug('')).toBe('stelle');
    expect(generateSlug('   ')).toBe('stelle');
  });
});
