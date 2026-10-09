import { describe, expect, it } from 'vitest';
import { sichererDateiname, zeitText } from '../konstanten';

describe('Video-Freigabe Hilfen', () => {
  it('Zeit als m:ss', () => {
    expect(zeitText(0)).toBe('0:00');
    expect(zeitText(75.4)).toBe('1:15');
    expect(zeitText(null)).toBe('–');
  });
  it('Dateiname ohne Umlaute und Sonderzeichen', () => {
    expect(sichererDateiname('Türhan Ad (final) v2.mp4')).toBe('Turhan-Ad-final-v2.mp4');
    expect(sichererDateiname('')).toBe('video.mp4');
  });
});
