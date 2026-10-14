import { createHmac, randomBytes } from 'crypto';
import type { TwilioConfig } from './config';

const b64url = (x: Buffer | string) => Buffer.from(x).toString('base64url');

/**
 * Zugangstoken für das Twilio Voice SDK im Browser (JWT HS256, wie twilio.jwt.AccessToken).
 * Nur ausgehende Anrufe über die TwiML-App, kein eingehendes Klingeln. identity = users.id
 */
export function voiceAccessToken(cfg: Pick<TwilioConfig, 'accountSid' | 'apiKeySid' | 'apiKeySecret' | 'twimlAppSid'>, identity: string, ttlSek = 3600, jetzt: Date = new Date()): string {
  const iat = Math.floor(jetzt.getTime() / 1000);
  const header = { typ: 'JWT', alg: 'HS256', cty: 'twilio-fpa;v=1' };
  const payload = {
    jti: `${cfg.apiKeySid}-${iat}-${randomBytes(4).toString('hex')}`,
    iss: cfg.apiKeySid,
    sub: cfg.accountSid,
    iat,
    nbf: iat,
    exp: iat + ttlSek,
    grants: { identity, voice: { outgoing: { application_sid: cfg.twimlAppSid } } },
  };
  const daten = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(payload))}`;
  return `${daten}.${createHmac('sha256', cfg.apiKeySecret).update(daten).digest('base64url')}`;
}
