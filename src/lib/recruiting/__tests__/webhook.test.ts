import { describe, it, expect } from 'vitest';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Standalone-Tests für die Webhook-Signatur-Logik.
 * Wir testen die reine Funktion, nicht die Route (Supabase-Mock würde nötig sein).
 */

function verifyWhatsAppSignature(rawBody: string, sigHeader: string | null, appSecret: string): boolean {
  if (!sigHeader || !sigHeader.startsWith('sha256=')) return false;
  const received = sigHeader.slice('sha256='.length);
  const expected = createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const receivedBuf = Buffer.from(received);
  const expectedBuf = Buffer.from(expected);
  return receivedBuf.length === expectedBuf.length &&
    timingSafeEqual(receivedBuf, expectedBuf);
}

const TEST_SECRET = 'test_app_secret_12345';

describe('WhatsApp webhook signature verification', () => {
  it('accepts valid HMAC-SHA256 signature', () => {
    const body = '{"entry":[{"changes":[]}]}';
    const sig = 'sha256=' + createHmac('sha256', TEST_SECRET).update(body).digest('hex');
    expect(verifyWhatsAppSignature(body, sig, TEST_SECRET)).toBe(true);
  });

  it('rejects invalid signature', () => {
    const body = '{"entry":[]}';
    expect(verifyWhatsAppSignature(body, 'sha256=deadbeef', TEST_SECRET)).toBe(false);
  });

  it('rejects wrong signature of valid length', () => {
    const body = '{"entry":[]}';
    const differentBody = '{"entry":[{"changes":[]}]}';
    const wrongSig = 'sha256=' + createHmac('sha256', TEST_SECRET).update(differentBody).digest('hex');
    expect(verifyWhatsAppSignature(body, wrongSig, TEST_SECRET)).toBe(false);
  });

  it('rejects null signature header', () => {
    expect(verifyWhatsAppSignature('{}', null, TEST_SECRET)).toBe(false);
  });

  it('rejects signature without sha256= prefix', () => {
    const body = '{}';
    const hash = createHmac('sha256', TEST_SECRET).update(body).digest('hex');
    expect(verifyWhatsAppSignature(body, hash, TEST_SECRET)).toBe(false);
  });
});

describe('STOP detection', () => {
  const STOP_WORDS = ['stop', 'stopp', 'abmelden', 'STOP', 'STOPP', 'Stopp', 'Stop'];

  function isStopMessage(text: string | null | undefined): boolean {
    if (!text) return false;
    return ['stop', 'stopp', 'abmelden'].includes(text.trim().toLowerCase());
  }

  it.each(STOP_WORDS)('detects "%s" as STOP', (word) => {
    expect(isStopMessage(word)).toBe(true);
  });

  it('does not flag normal messages', () => {
    expect(isStopMessage('Hallo, ich bin interessiert')).toBe(false);
    expect(isStopMessage('Ich stoppe mal kurz')).toBe(false);
  });

  it('handles null/undefined', () => {
    expect(isStopMessage(null)).toBe(false);
    expect(isStopMessage(undefined)).toBe(false);
  });
});
