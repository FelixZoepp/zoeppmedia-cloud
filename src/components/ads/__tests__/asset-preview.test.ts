import { describe, it, expect } from 'vitest';
import { driveFileId, dropboxRaw, isLinkErlaubt } from '../asset-preview';

describe('Drive/Dropbox-Links', () => {
  it('erkennt die Drive-Datei-ID in allen üblichen Formen', () => {
    expect(driveFileId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing')).toBe('1AbCdEfGhIjKlMnOp');
    expect(driveFileId('https://drive.google.com/open?id=1AbCdEfGhIjKlMnOp')).toBe('1AbCdEfGhIjKlMnOp');
    expect(driveFileId('https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOp')).toBe('1AbCdEfGhIjKlMnOp');
    expect(driveFileId('https://www.dropbox.com/s/abc/ad.mp4?dl=0')).toBeNull();
  });

  it('Dropbox-Link → direkte Datei (raw=1)', () => {
    expect(dropboxRaw('https://www.dropbox.com/scl/fi/xyz/ad.mp4?rlkey=k&dl=0')).toBe('https://www.dropbox.com/scl/fi/xyz/ad.mp4?rlkey=k&raw=1');
    expect(dropboxRaw('https://drive.google.com/file/d/1/view')).toBeNull();
  });

  it('nur Drive- und Dropbox-Links gelten als Standard', () => {
    expect(isLinkErlaubt('https://drive.google.com/file/d/1/view')).toBe(true);
    expect(isLinkErlaubt('https://www.dropbox.com/s/abc/ad.mp4?dl=0')).toBe(true);
    expect(isLinkErlaubt('https://wetransfer.com/downloads/abc')).toBe(false);
  });
});
