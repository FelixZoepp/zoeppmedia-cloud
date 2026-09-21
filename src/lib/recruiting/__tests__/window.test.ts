import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { nextAllowedTime } from '@/lib/whatsapp/window';

describe('nextAllowedTime', () => {
  it('Samstag 21:00 -> Montag 08:00', () => {
    // 2026-10-10 ist ein Samstag
    const sat21 = new Date('2026-10-10T19:00:00Z'); // 21:00 CEST
    const result = nextAllowedTime(sat21, 'Europe/Berlin');
    // Nächster erlaubter Zeitpunkt: Montag 08:00 CEST = 06:00 UTC
    const expected = new Date('2026-10-12T06:00:00Z');
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('Sonntag 10:00 -> Montag 08:00', () => {
    const sun10 = new Date('2026-10-11T08:00:00Z'); // 10:00 CEST
    const result = nextAllowedTime(sun10, 'Europe/Berlin');
    const expected = new Date('2026-10-12T06:00:00Z');
    expect(result.getTime()).toBe(expected.getTime());
  });

  it('Mittwoch 15:00 (Geschäftszeit) -> Mittwoch 15:00 unverändert', () => {
    const wed15 = new Date('2026-10-07T13:00:00Z'); // 15:00 CEST
    const result = nextAllowedTime(wed15, 'Europe/Berlin');
    expect(result.getTime()).toBe(wed15.getTime());
  });

  it('Dienstag 22:00 -> Mittwoch 08:00', () => {
    const tue22 = new Date('2026-10-06T20:00:00Z'); // 22:00 CEST
    const result = nextAllowedTime(tue22, 'Europe/Berlin');
    const expected = new Date('2026-10-07T06:00:00Z'); // Mi 08:00 CEST
    expect(result.getTime()).toBe(expected.getTime());
  });
});

describe('window logic', () => {
  it('isWindowOpen returns true when window_expires_at is in the future', async () => {
    const { isWindowOpen } = await import('@/lib/whatsapp/window');
    const future = new Date(Date.now() + 3600_000).toISOString();
    expect(isWindowOpen(future)).toBe(true);
  });

  it('isWindowOpen returns false when window_expires_at is in the past', async () => {
    const { isWindowOpen } = await import('@/lib/whatsapp/window');
    const past = new Date(Date.now() - 1000).toISOString();
    expect(isWindowOpen(past)).toBe(false);
  });

  it('isWindowOpen returns false when null', async () => {
    const { isWindowOpen } = await import('@/lib/whatsapp/window');
    expect(isWindowOpen(null)).toBe(false);
  });
});

describe('quiet hours', () => {
  it('returns false during business hours (12:00 Europe/Berlin on Wednesday)', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    // Mock: Mittwoch 12:00 Berlin
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z')); // 12:00 Berlin (UTC+2)
    expect(isQuietHours('Europe/Berlin')).toBe(false);
    vi.useRealTimers();
  });

  it('returns true at 22:00 on a weekday', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T20:00:00Z')); // 22:00 Berlin
    expect(isQuietHours('Europe/Berlin')).toBe(true);
    vi.useRealTimers();
  });

  it('returns true on Sunday', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-27T10:00:00Z')); // Sonntag 12:00 Berlin
    expect(isQuietHours('Europe/Berlin')).toBe(true);
    vi.useRealTimers();
  });

  // I2: Grenzwert-Tests für Ruhezeit-Grenzen (Mo–Sa)
  it('07:59 Berlin (Mo) → Ruhezeit (quiet)', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    vi.useFakeTimers();
    // Montag 2026-09-28, 07:59 Berlin = 05:59 UTC (UTC+2 im Sommer)
    vi.setSystemTime(new Date('2026-09-28T05:59:00Z'));
    expect(isQuietHours('Europe/Berlin')).toBe(true);
    vi.useRealTimers();
  });

  it('08:00 Berlin (Mo) → Geschäftszeit (not quiet)', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    vi.useFakeTimers();
    // Montag 2026-09-28, 08:00 Berlin = 06:00 UTC
    vi.setSystemTime(new Date('2026-09-28T06:00:00Z'));
    expect(isQuietHours('Europe/Berlin')).toBe(false);
    vi.useRealTimers();
  });

  it('19:59 Berlin (Mo) → Geschäftszeit (not quiet)', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    vi.useFakeTimers();
    // Montag 2026-09-28, 19:59 Berlin = 17:59 UTC
    vi.setSystemTime(new Date('2026-09-28T17:59:00Z'));
    expect(isQuietHours('Europe/Berlin')).toBe(false);
    vi.useRealTimers();
  });

  it('20:00 Berlin (Mo) → Ruhezeit (quiet)', async () => {
    const { isQuietHours } = await import('@/lib/whatsapp/window');
    vi.useFakeTimers();
    // Montag 2026-09-28, 20:00 Berlin = 18:00 UTC
    vi.setSystemTime(new Date('2026-09-28T18:00:00Z'));
    expect(isQuietHours('Europe/Berlin')).toBe(true);
    vi.useRealTimers();
  });
});

describe('STOP detection', () => {
  it.each(['stop', 'STOP', 'Stopp', 'stopp', 'STOPP', 'abmelden', 'Abmelden'])(
    'detects "%s" as STOP message', async (word) => {
      const { isStopMessage } = await import('@/lib/whatsapp/window');
      expect(isStopMessage(word)).toBe(true);
    }
  );

  it('does not flag partial matches', async () => {
    const { isStopMessage } = await import('@/lib/whatsapp/window');
    expect(isStopMessage('Ich stoppe mal kurz')).toBe(false);
    expect(isStopMessage('Bitte nicht stoppen')).toBe(false);
  });
});

describe('preflight checks', () => {
  it('rejects when consent_whatsapp is false', async () => {
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: false,
      windowExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      isTemplate: false,
      isHumanUiSend: false,
      timezone: 'Europe/Berlin',
      accountConnected: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Einwilligung');
  });

  it('rejects free text with closed window', async () => {
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: true,
      windowExpiresAt: new Date(Date.now() - 1000).toISOString(),
      isTemplate: false,
      isHumanUiSend: false,
      timezone: 'Europe/Berlin',
      accountConnected: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Fenster');
  });

  it('allows template with closed window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T10:00:00Z')); // Mittwoch 12:00 Berlin
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: true,
      windowExpiresAt: new Date(Date.now() - 1000).toISOString(),
      isTemplate: true,
      isHumanUiSend: false,
      timezone: 'Europe/Berlin',
      accountConnected: true,
    });
    expect(result.ok).toBe(true);
    vi.useRealTimers();
  });

  it('rejects automated send during quiet hours', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T20:00:00Z')); // 22:00 Berlin
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: true,
      windowExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      isTemplate: true,
      isHumanUiSend: false,
      timezone: 'Europe/Berlin',
      accountConnected: true,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('Ruhezeit');
    vi.useRealTimers();
  });

  it('allows human UI send during quiet hours (exempt)', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T20:00:00Z')); // 22:00 Berlin
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: true,
      windowExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      isTemplate: true,
      isHumanUiSend: true,
      timezone: 'Europe/Berlin',
      accountConnected: true,
    });
    expect(result.ok).toBe(true);
    vi.useRealTimers();
  });

  it('rejects when account not connected', async () => {
    const { checkPreflight } = await import('@/lib/whatsapp/window');
    const result = checkPreflight({
      consentWhatsapp: true,
      windowExpiresAt: new Date(Date.now() + 3600_000).toISOString(),
      isTemplate: false,
      isHumanUiSend: false,
      timezone: 'Europe/Berlin',
      accountConnected: false,
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('verbunden');
  });
});
