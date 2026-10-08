import { describe, expect, it } from 'vitest';
import { istErlaubterPushEndpoint, istOeffentlicheUrl, istPrivateIp } from '../ssrf';

describe('istPrivateIp', () => {
  it('erkennt interne Adressen', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::ffff:169.254.169.254', 'fd00::1', 'fe80::1']) {
      expect(istPrivateIp(ip), ip).toBe(true);
    }
  });
  it('lässt öffentliche Adressen durch', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '2606:4700::1111']) {
      expect(istPrivateIp(ip), ip).toBe(false);
    }
  });
});

describe('istOeffentlicheUrl', () => {
  it('blockt interne Ziele ohne DNS', async () => {
    for (const url of ['http://127.0.0.1/x', 'http://[::ffff:169.254.169.254]/', 'http://localhost:3000', 'file:///etc/passwd', 'https://user:pw@8.8.8.8/']) {
      expect(await istOeffentlicheUrl(url), url).toBe(false);
    }
  });
  it('lässt öffentliche IPs durch', async () => {
    expect(await istOeffentlicheUrl('https://8.8.8.8/')).toBe(true);
  });
});

describe('istErlaubterPushEndpoint', () => {
  it('nur bekannte Push-Dienste', () => {
    expect(istErlaubterPushEndpoint('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(istErlaubterPushEndpoint('https://web.push.apple.com/QG')).toBe(true);
    expect(istErlaubterPushEndpoint('https://wns2-par02p.notify.windows.com/w/?token=x')).toBe(true);
    expect(istErlaubterPushEndpoint('https://127.0.0.1:8443/internal')).toBe(false);
    expect(istErlaubterPushEndpoint('https://evil.com/fcm.googleapis.com')).toBe(false);
    expect(istErlaubterPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
  });
});
