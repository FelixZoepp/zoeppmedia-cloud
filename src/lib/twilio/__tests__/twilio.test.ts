import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';
import { fehlendeTwilioVariablen, twilioConfig } from '../config';
import { signaturGueltig, twilioSignatur } from '../signatur';
import { voiceAccessToken } from '../token';
import { twimlSagen, twimlWaehlen } from '../twiml';

describe('twilio config', () => {
  it('meldet fehlende Variablen', () => {
    expect(fehlendeTwilioVariablen({ TWILIO_ACCOUNT_SID: 'AC1' })).toEqual(['TWILIO_AUTH_TOKEN', 'TWILIO_API_KEY_SID', 'TWILIO_API_KEY_SECRET', 'TWILIO_TWIML_APP_SID']);
    expect(twilioConfig({})).toBeNull();
    expect(twilioConfig({ TWILIO_ACCOUNT_SID: 'AC1', TWILIO_AUTH_TOKEN: 't', TWILIO_API_KEY_SID: 'SK1', TWILIO_API_KEY_SECRET: 's', TWILIO_TWIML_APP_SID: 'AP1' })?.callerId).toBeNull();
  });
});

describe('Signatur', () => {
  // Referenzwert mit getExpectedTwilioSignature aus der offiziellen twilio-Bibliothek berechnet
  it('entspricht dem Twilio-Beispiel', () => {
    const params = { CallSid: 'CA1234567890ABCDE', Caller: '+12349013030', Digits: '1234', From: '+12349013030', To: '+18005551212' };
    const sig = twilioSignatur('12345', 'https://example.com/myapp.php?foo=1&bar=2', params);
    expect(sig).toBe('vNe7KK2kJwCsxc9K3OLkkKB3qqI=');
    expect(signaturGueltig('12345', 'https://example.com/myapp.php?foo=1&bar=2', params, sig)).toBe(true);
    expect(signaturGueltig('12345', 'https://example.com/myapp.php?foo=1&bar=2', { ...params, To: '+1' }, sig)).toBe(false);
    expect(signaturGueltig('12345', 'https://example.com/x', params, null)).toBe(false);
  });
});

describe('Zugangstoken', () => {
  it('ist ein gültiges HS256-JWT mit Voice-Grant', () => {
    const t = voiceAccessToken({ accountSid: 'AC1', apiKeySid: 'SK1', apiKeySecret: 'geheim', twimlAppSid: 'AP1' }, 'user-1', 600, new Date('2026-10-14T10:00:00Z'));
    const [h, p, s] = t.split('.');
    expect(createHmac('sha256', 'geheim').update(`${h}.${p}`).digest('base64url')).toBe(s);
    const payload = JSON.parse(Buffer.from(p, 'base64url').toString());
    expect(payload.iss).toBe('SK1');
    expect(payload.sub).toBe('AC1');
    expect(payload.exp - payload.iat).toBe(600);
    expect(payload.grants).toEqual({ identity: 'user-1', voice: { outgoing: { application_sid: 'AP1' } } });
    expect(JSON.parse(Buffer.from(h, 'base64url').toString()).cty).toBe('twilio-fpa;v=1');
  });
});

describe('TwiML', () => {
  it('wählt mit Aufnahme und Ansage', () => {
    const x = twimlWaehlen({ nummer: '+491701234567', callerId: '+4930123456', basis: 'https://cloud.zoeppmedia.de', anrufId: 'a1', aufnahme: true });
    expect(x).toContain('record="record-from-answer-dual"');
    expect(x).toContain('<Number url="https://cloud.zoeppmedia.de/api/twilio/ansage">+491701234567</Number>');
    expect(x).toContain('recordingStatusCallback="https://cloud.zoeppmedia.de/api/twilio/aufnahme?anruf=a1"');
    expect(x).toContain('callerId="+4930123456"');
  });
  it('wählt ohne Aufnahme ohne Ansage', () => {
    const x = twimlWaehlen({ nummer: '+491701234567', callerId: '+4930123456', basis: 'https://b', anrufId: 'a1', aufnahme: false });
    expect(x).not.toContain('record=');
    expect(x).toContain('<Number>+491701234567</Number>');
  });
  it('maskiert Text', () => {
    expect(twimlSagen('a < b & "c"')).toContain('a &lt; b &amp; &quot;c&quot;');
  });
});
