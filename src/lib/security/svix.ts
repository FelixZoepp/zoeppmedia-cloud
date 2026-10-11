import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Signatur von Resend-Webhooks (Svix) prüfen: HMAC-SHA256 über „id.timestamp.body“ mit dem
 * Webhook-Secret (whsec_…), Zeitstempel höchstens 5 Minuten alt.
 */
export function svixGueltig(secret: string, headers: Headers, body: string, jetzt = Date.now()): boolean {
  const id = headers.get('svix-id');
  const ts = headers.get('svix-timestamp');
  const sig = headers.get('svix-signature');
  if (!id || !ts || !sig) return false;
  const t = Number(ts);
  if (!Number.isFinite(t) || Math.abs(jetzt / 1000 - t) > 300) return false;
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const soll = createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
  return sig.split(' ').some((teil) => {
    const [version, wert] = teil.split(',');
    if (version !== 'v1' || !wert) return false;
    const a = Buffer.from(wert);
    const b = Buffer.from(soll);
    return a.length === b.length && timingSafeEqual(a, b);
  });
}
