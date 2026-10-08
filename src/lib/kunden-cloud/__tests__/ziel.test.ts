import { describe, expect, it } from 'vitest';
import { sicheresZiel } from '../ziel';

const BASIS = 'https://cloud.zoeppmedia.de/api/admin/impersonate';

describe('sicheresZiel', () => {
  it('lässt interne Pfade durch', () => {
    expect(sicheresZiel('/candidates/c1?x=1', BASIS).href).toBe('https://cloud.zoeppmedia.de/candidates/c1?x=1');
  });

  it('blockt fremde Domains', () => {
    for (const ziel of ['//evil.com', '/\\evil.com', 'https://evil.com', '/\\/evil.com']) {
      expect(sicheresZiel(ziel, BASIS).href).toBe('https://cloud.zoeppmedia.de/candidates');
    }
  });

  it('fällt ohne Ziel auf /candidates zurück', () => {
    expect(sicheresZiel(null, BASIS).pathname).toBe('/candidates');
  });
});
