import { describe, expect, it } from 'vitest';
import { endungFuer, istDateiLink } from '../dateien';

describe('Funnel-Dateien', () => {
  it('erkennt Upload-Links', () => {
    expect(istDateiLink('https://uploads.leadnotifications.co/download/1f1c9466?filename=image.jpg&filesize=1506959')).toBe(true);
    expect(istDateiLink('https://example.com/cv.pdf')).toBe(true);
    expect(istDateiLink('https://example.com/seite')).toBe(false);
    expect(istDateiLink('http://example.com/bild.jpg')).toBe(false);
    expect(istDateiLink('Geld verdienen')).toBe(false);
  });
  it('Endung aus MIME', () => {
    expect(endungFuer('image/jpeg')).toBe('jpg');
    expect(endungFuer('image/png')).toBe('png');
    expect(endungFuer('application/pdf')).toBe('pdf');
  });
});
