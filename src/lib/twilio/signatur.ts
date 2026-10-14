import { createHmac, timingSafeEqual } from 'crypto';

/**
 * X-Twilio-Signature prüfen: Base64(HMAC-SHA1(AuthToken, URL + alle POST-Parameter sortiert als key+value)).
 * url = exakt die URL, die Twilio aufgerufen hat (inkl. Query).
 */
export function twilioSignatur(authToken: string, url: string, params: Record<string, string>): string {
  const daten = url + Object.keys(params).sort().map((k) => k + params[k]).join('');
  return createHmac('sha1', authToken).update(Buffer.from(daten, 'utf-8')).digest('base64');
}

export function signaturGueltig(authToken: string, url: string, params: Record<string, string>, signatur: string | null): boolean {
  if (!signatur) return false;
  const erwartet = Buffer.from(twilioSignatur(authToken, url, params));
  const bekommen = Buffer.from(signatur);
  return erwartet.length === bekommen.length && timingSafeEqual(erwartet, bekommen);
}
