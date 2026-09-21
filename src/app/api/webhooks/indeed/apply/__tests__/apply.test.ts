import { describe, it, expect } from 'vitest';
import { verifyIndeedSignature } from '@/app/api/webhooks/indeed/apply/route';
import { createHmac } from 'crypto';

const secret = 'test-secret';
const body = JSON.stringify({ id: 'abc' });
const sig = createHmac('sha1', secret).update(body).digest('base64');

describe('verifyIndeedSignature', () => {
  it('akzeptiert gültige Signatur', () => {
    expect(verifyIndeedSignature(body, sig, secret)).toBe(true);
  });
  it('lehnt falsche Signatur ab', () => {
    expect(verifyIndeedSignature(body, 'falsch', secret)).toBe(false);
  });
  it('lehnt leere Signatur ab', () => {
    expect(verifyIndeedSignature(body, null, secret)).toBe(false);
  });
});
