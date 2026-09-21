import { describe, it, expect, vi, afterEach } from 'vitest';
import { verifyTurnstile } from '../turnstile';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('verifyTurnstile', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // 1. TURNSTILE_SECRET_KEY unset → true ohne fetch (Ruling P7-R4)
  it('ohne TURNSTILE_SECRET_KEY: gibt true zurueck ohne fetch aufzurufen', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await verifyTurnstile('any-token');

    expect(result).toBe(true);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // 2. Secret gesetzt, token null → false
  it('Secret gesetzt, token null: gibt false zurueck', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    const result = await verifyTurnstile(null);

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // 3. Secret gesetzt, siteverify success:true → true
  it('siteverify antwortet success:true: gibt true zurueck', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ success: true }),
    }));

    const result = await verifyTurnstile('valid-token');

    expect(result).toBe(true);
  });

  // 4. Secret gesetzt, siteverify success:false → false
  it('siteverify antwortet success:false: gibt false zurueck', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({ success: false }),
    }));

    const result = await verifyTurnstile('invalid-token');

    expect(result).toBe(false);
  });

  // 5. fetch wirft → false
  it('fetch wirft Fehler: gibt false zurueck', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network error')));

    const result = await verifyTurnstile('some-token');

    expect(result).toBe(false);
  });

  // Bonus: leerer Token-String mit gesetztem Secret → false (kein fetch)
  it('leerer Token-String mit gesetztem Secret: gibt false zurueck', async () => {
    vi.stubEnv('TURNSTILE_SECRET_KEY', 'test-secret');
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    // empty string is falsy-ish but not null — verifyTurnstile checks !token
    const result = await verifyTurnstile('');

    expect(result).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
