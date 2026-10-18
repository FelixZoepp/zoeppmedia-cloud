import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/whatsapp/send', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('@/lib/activity/log', () => ({ logActivity: vi.fn() }));

import { KETTE, schrittZeit, versandZeit } from '../eintrag-kette';
import { SALES_VORLAGEN } from '../vorlagen';

describe('Eintrag-Kette – Zeitpunkte', () => {
  it('tagsüber unverändert, nachts auf 8:30 Uhr Berlin', () => {
    const tag = new Date('2026-10-12T10:00:00Z'); // 12:00 Berlin
    expect(versandZeit(tag)).toEqual(tag);
    expect(versandZeit(new Date('2026-10-12T19:00:00Z')).toISOString()).toBe('2026-10-13T06:30:00.000Z'); // 21:00 → 8:30 (Sommerzeit)
    expect(versandZeit(new Date('2026-10-12T04:00:00Z')).toISOString()).toBe('2026-10-12T06:30:00.000Z'); // 6:00 → 8:30
  });
  it('15 Min. / nächster Tag / Tag 3', () => {
    const ein = new Date('2026-10-12T09:00:00Z');
    expect(schrittZeit(ein, 1, ein).toISOString()).toBe('2026-10-12T09:15:00.000Z');
    expect(schrittZeit(ein, 2, ein).toISOString()).toBe('2026-10-13T09:00:00.000Z');
    expect(schrittZeit(ein, 3, ein).toISOString()).toBe('2026-10-15T09:00:00.000Z');
  });
});

describe('Eintrag-Kette – Vorlagen', () => {
  for (const k of KETTE) {
    it(`${k.vorlage}: gültig für Meta`, () => {
      const v = SALES_VORLAGEN.find((x) => x.name === k.vorlage)!;
      expect(v).toBeTruthy();
      expect(v.body.length).toBeLessThanOrEqual(1024);
      expect(v.body).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
      for (const b of v.buttons) expect(b.text.length).toBeLessThanOrEqual(25);
      // Der dynamische Termin-Button steht an der Position, die der Versand befüllt
      const btn = v.buttons[Number(k.buttonIndex)];
      expect(btn.type === 'URL' && btn.url.includes('{{1}}')).toBe(true);
    });
  }
});

describe('Wochenende und Abend', () => {
  it('erkennt Sa/So in Berlin', async () => {
    const { istWochenende } = await import('../eintrag-kette');
    expect(istWochenende(new Date('2026-10-18T12:00:00Z'))).toBe(true); // So
    expect(istWochenende(new Date('2026-10-17T22:30:00Z'))).toBe(true); // So 0:30 Berlin
    expect(istWochenende(new Date('2026-10-19T12:00:00Z'))).toBe(false); // Mo
  });
  it('verschickt bis 21 Uhr, auch sonntags', () => {
    const so = new Date('2026-10-18T18:45:00Z'); // So 20:45 Berlin
    expect(versandZeit(so)).toEqual(so);
    expect(versandZeit(new Date('2026-10-18T19:05:00Z')).toISOString()).toBe('2026-10-19T06:30:00.000Z'); // 21:05 → Mo 8:30
  });
});
