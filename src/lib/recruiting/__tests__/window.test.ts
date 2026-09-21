import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
