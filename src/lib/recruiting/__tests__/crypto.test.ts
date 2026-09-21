import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Set test encryption key before importing module
const TEST_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

describe('crypto', () => {
  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', TEST_KEY);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('roundtrip: decrypt(encrypt(plain)) === plain', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto');
    const plain = 'EAABsbCS1iZAg_test_token_12345';
    const encrypted = encryptSecret(plain);
    expect(encrypted).not.toBe(plain);
    expect(encrypted.split(':').length).toBe(3);
    const decrypted = decryptSecret(encrypted);
    expect(decrypted).toBe(plain);
  });

  it('different encryptions produce different ciphertexts (random IV)', async () => {
    const { encryptSecret } = await import('@/lib/crypto');
    const plain = 'same_token';
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
  });

  it('throws German error when ENCRYPTION_KEY missing', async () => {
    vi.stubEnv('ENCRYPTION_KEY', '');
    // Force fresh import
    vi.resetModules();
    const mod = await import('@/lib/crypto');
    expect(() => mod.encryptSecret('x')).toThrow('ENCRYPTION_KEY');
  });

  it('throws German error when ENCRYPTION_KEY has wrong length', async () => {
    vi.stubEnv('ENCRYPTION_KEY', 'tooshort');
    vi.resetModules();
    const mod = await import('@/lib/crypto');
    expect(() => mod.encryptSecret('x')).toThrow('64 Hex-Zeichen');
  });

  it('decryptSecret throws on tampered ciphertext', async () => {
    const { encryptSecret, decryptSecret } = await import('@/lib/crypto');
    const encrypted = encryptSecret('test');
    const parts = encrypted.split(':');
    parts[2] = 'AAAA' + parts[2].slice(4); // tamper ciphertext
    expect(() => decryptSecret(parts.join(':'))).toThrow();
  });
});
