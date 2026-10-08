import { lookup } from 'dns/promises';
import { isIP } from 'net';

/** true für Loopback, private Netze, Link-Local, CGNAT, Multicast und IPv6-ULA – also alles, was nicht ins Internet gehört. */
export function istPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (v === 6) {
    const x = ip.toLowerCase().replace(/^\[|\]$/g, '');
    if (x === '::' || x === '::1') return true;
    const mapped = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return istPrivateIp(mapped[1]);
    if (/^::ffff:[0-9a-f]{1,4}:[0-9a-f]{1,4}$/.test(x)) return true; // IPv4-mapped in Hex-Schreibweise
    return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(x);
  }
  return true; // keine gültige IP → sicherheitshalber sperren
}

/**
 * Prüft, ob eine URL auf ein öffentliches Ziel zeigt: nur http(s), keine Zugangsdaten in der URL,
 * und jede DNS-Auflösung des Hosts muss eine öffentliche IP sein.
 */
export async function istOeffentlicheUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false;
  if (isIP(host)) return !istPrivateIp(host);
  try {
    const adressen = await lookup(host, { all: true, verbatim: true });
    return adressen.length > 0 && adressen.every((a) => !istPrivateIp(a.address));
  } catch {
    return false;
  }
}

/**
 * fetch für URLs aus Nutzerdaten: prüft Ziel und jede Weiterleitung einzeln (redirect: 'manual'),
 * damit ein Redirect nicht ins interne Netz führt.
 */
export async function sichererFetch(raw: string, init: RequestInit = {}, maxWeiterleitungen = 3): Promise<Response> {
  let ziel = raw;
  for (let i = 0; i <= maxWeiterleitungen; i++) {
    if (!(await istOeffentlicheUrl(ziel))) throw new Error('Unzulässige URL');
    const res = await fetch(ziel, { ...init, redirect: 'manual' });
    const location = res.headers?.get('location');
    if (res.status >= 300 && res.status < 400 && location) {
      ziel = new URL(location, ziel).toString();
      continue;
    }
    return res;
  }
  throw new Error('Zu viele Weiterleitungen');
}

/** Bekannte Web-Push-Dienste (Chrome/Edge, Firefox, Safari, Windows). */
const PUSH_HOSTS = [
  'fcm.googleapis.com',
  'android.googleapis.com',
  'updates.push.services.mozilla.com',
  'push.services.mozilla.com',
  'web.push.apple.com',
  '.push.apple.com',
  '.notify.windows.com',
];

/** Push-Endpoints dürfen nur auf bekannte Push-Dienste per https zeigen. */
export function istErlaubterPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.port) return false;
  const h = url.hostname.toLowerCase();
  return PUSH_HOSTS.some((p) => (p.startsWith('.') ? h.endsWith(p) : h === p));
}
