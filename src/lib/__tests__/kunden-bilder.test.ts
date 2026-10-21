import { describe, expect, it } from 'vitest';
import { bilderSlackText, bildPfad, istEigenerBildPfad, pruefeBild } from '@/lib/kunden-bilder';

const A = '4ae31c44-f2e3-4d3e-a30b-e694f5449fee';

describe('kunden-bilder', () => {
  it('prüft Typ und Größe', () => {
    expect(pruefeBild('image/jpeg', 1000)).toBeNull();
    expect(pruefeBild('image/heic', 1000)).toBeNull();
    expect(pruefeBild('application/pdf', 1000)).toMatch(/JPG/);
    expect(pruefeBild('image/png', 0)).toMatch(/leer/);
    expect(pruefeBild('image/png', 16 * 1024 * 1024)).toMatch(/zu groß/);
  });

  it('Pfad gehört nur zum eigenen Kunden', () => {
    const p = bildPfad(A, 'image/png');
    expect(istEigenerBildPfad(p, A)).toBe(true);
    expect(istEigenerBildPfad(p, 'f169706a-4a5e-4375-a176-a5d19419435b')).toBe(false);
    expect(istEigenerBildPfad(`${A}/../x/1-abcdef12.png`, A)).toBe(false);
  });

  it('Slack-Text nennt Anzahl und warnt ohne Fotos vom Kunden', () => {
    expect(bilderSlackText('Fadi Abbes', { ich: 3, team: 1 }, 'https://x/y')).toBe('🖼️ *Fadi Abbes* hat 4 Bilder hochgeladen: 3× Fotos von dir, 1× Team\n<https://x/y|Bilder ansehen>');
    expect(bilderSlackText('Rudi', { logo: 1 }, 'https://x')).toContain('Noch keine Fotos vom Kunden selbst');
  });
});
