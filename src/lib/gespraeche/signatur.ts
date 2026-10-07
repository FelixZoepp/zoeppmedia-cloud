import { createHmac, timingSafeEqual } from 'node:crypto';

/** Signatur „sha256=<hex>“ (Fireflies Webhooks V2, Header X-Hub-Signature) prüfen */
export function signaturOk(roh: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const erwartet = `sha256=${createHmac('sha256', secret).update(roh).digest('hex')}`;
  const a = Buffer.from(header.trim());
  const b = Buffer.from(erwartet);
  return a.length === b.length && timingSafeEqual(a, b);
}
