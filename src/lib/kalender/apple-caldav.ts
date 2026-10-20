/**
 * Apple-Kalender (iCloud) über CalDAV: Apple bietet kein OAuth für Kalender – verbunden wird mit Apple-ID
 * und einem app-spezifischen Passwort (appleid.apple.com → Anmeldung & Sicherheit → App-spezifische Passwörter).
 * - belegte Zeiten: REPORT calendar-query mit <expand> über alle Termin-Kalender (Serien löst iCloud selbst auf)
 * - Termine: PUT/DELETE einer .ics-Ressource im gewählten Kalender, Verschieben = .ics laden, Zeiten ersetzen, PUT
 * Nur https://*.icloud.com – Adressen aus den iCloud-Antworten werden vor jedem Abruf geprüft (kein SSRF).
 */

import { randomUUID } from 'node:crypto';

export const ICLOUD_START = 'https://caldav.icloud.com/';

export interface AppleZugang {
  appleId: string;
  passwort: string;
}

export interface AppleKalender {
  url: string;
  name: string;
  schreibbar: boolean;
}

/** Nur iCloud-Adressen per https zulassen (rein, testbar) */
export function istIcloudUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && (u.hostname === 'icloud.com' || u.hostname.endsWith('.icloud.com'));
  } catch {
    return false;
  }
}

function auth(z: AppleZugang): string {
  return `Basic ${Buffer.from(`${z.appleId}:${z.passwort}`).toString('base64')}`;
}

async function dav(z: AppleZugang, url: string, method: string, body?: string, extra: Record<string, string> = {}): Promise<Response> {
  if (!istIcloudUrl(url)) throw new Error('Unerwartete Kalender-Adresse');
  const res = await fetch(url, {
    method,
    redirect: 'manual',
    headers: { Authorization: auth(z), ...(body ? { 'Content-Type': method === 'PUT' ? 'text/calendar; charset=utf-8' : 'application/xml; charset=utf-8' } : {}), ...extra },
    body,
    cache: 'no-store',
  });
  // Weiterleitungen nur innerhalb von iCloud folgen (fetch würde den Zugang sonst an jede Adresse schicken)
  if (res.status >= 300 && res.status < 400) {
    const ziel = res.headers.get('location');
    if (!ziel) throw new Error(`iCloud ${res.status} ohne Ziel`);
    return dav(z, new URL(ziel, url).toString(), method, body, extra);
  }
  if (res.status === 401) throw new Error('Apple-ID oder app-spezifisches Passwort falsch');
  return res;
}

/* ── XML (Multistatus) – bewusst ohne Parser-Bibliothek, Namensraum-Präfix egal ─────────────────── */

const tag = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'i');
const tagAlle = (name: string) => new RegExp(`<(?:[\\w-]+:)?${name}\\b[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${name}>`, 'gi');

function entities(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#13;/g, '\r').replace(/&#10;/g, '\n').replace(/&amp;/g, '&');
}

/** Einzelne <response>-Blöcke einer Multistatus-Antwort (rein, testbar) */
export function antworten(xml: string): string[] {
  return [...xml.matchAll(tagAlle('response'))].map((m) => m[1]);
}

/** href innerhalb eines Elements, z. B. current-user-principal oder calendar-home-set (rein, testbar) */
export function hrefIn(xml: string, element: string): string | null {
  const block = xml.match(tag(element))?.[1];
  const href = block?.match(tag('href'))?.[1];
  return href ? entities(href.trim()) : null;
}

/** Termin-Kalender aus der Antwort auf PROPFIND (Depth 1) des Kalender-Stamms (rein, testbar) */
export function kalenderAusAntwort(xml: string, basis: string): AppleKalender[] {
  const out: AppleKalender[] = [];
  for (const r of antworten(xml)) {
    const typ = r.match(tag('resourcetype'))?.[1] ?? '';
    if (!/<(?:[\w-]+:)?calendar\b/i.test(typ)) continue;
    const komps = r.match(tag('supported-calendar-component-set'))?.[1];
    if (komps && !/name=["']VEVENT["']/i.test(komps)) continue; // Erinnerungen/Aufgaben-Listen auslassen
    const href = r.match(tag('href'))?.[1];
    if (!href) continue;
    const rechte = r.match(tag('current-user-privilege-set'))?.[1] ?? '';
    const schreibbar = !rechte || /<(?:[\w-]+:)?(write|write-content|all)\b/i.test(rechte);
    const name = entities((r.match(tag('displayname'))?.[1] ?? '').trim()) || 'Kalender';
    out.push({ url: new URL(entities(href.trim()), basis).toString(), name, schreibbar });
  }
  return out;
}

/** Standard-Kalender wählen: beschreibbar, bevorzugt „Kalender/Calendar/Privat/Home/Arbeit“ (rein, testbar) */
export function waehleKalender(liste: AppleKalender[]): AppleKalender | null {
  const schreibbar = liste.filter((k) => k.schreibbar);
  const bevorzugt = /^(kalender|calendar|privat|home|zuhause|arbeit|work)$/i;
  return schreibbar.find((k) => bevorzugt.test(k.name)) ?? schreibbar[0] ?? null;
}

/* ── ICS ─────────────────────────────────────────────────────────────────────────────── */

/** Zeilenumbrüche nach RFC 5545 auffalten */
function entfalte(ics: string): string[] {
  return ics.replace(/\r?\n[ \t]/g, '').split(/\r?\n/);
}

/** DTSTART/DTEND-Wert → Date. Ganztägig (VALUE=DATE) = Mitternacht Berlin; ohne Z/TZID = Berliner Ortszeit (rein, testbar) */
export function icsZeit(zeile: string): { zeit: Date; ganztags: boolean } | null {
  const [kopf, wert] = [zeile.slice(0, zeile.indexOf(':')), zeile.slice(zeile.indexOf(':') + 1).trim()];
  if (!wert) return null;
  const m = wert.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;
  const [, j, mo, t, h, mi, s, z] = m;
  if (!h) return { zeit: berlin(+j, +mo, +t, 0, 0, 0), ganztags: true };
  if (z) return { zeit: new Date(Date.UTC(+j, +mo - 1, +t, +h, +mi, +s)), ganztags: false };
  // TZID=…: iCloud liefert bei <expand> UTC; sonst als Berliner Ortszeit lesen (Kunden sitzen in DE/AT)
  void kopf;
  return { zeit: berlin(+j, +mo, +t, +h, +mi, +s), ganztags: false };
}

/** Ortszeit Europe/Berlin → Date */
function berlin(j: number, mo: number, t: number, h: number, mi: number, s: number): Date {
  const utc = Date.UTC(j, mo - 1, t, h, mi, s);
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(fmt.formatToParts(new Date(utc)).map((x) => [x.type, x.value]));
  const alsBerlin = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return new Date(utc - (alsBerlin - utc));
}

/** Belegte Zeiten aus einem oder mehreren VCALENDAR-Texten (rein, testbar) */
export function belegtAusIcs(ics: string): Array<{ starts_at: string; ends_at: string }> {
  const out: Array<{ starts_at: string; ends_at: string }> = [];
  let ev: Record<string, string> | null = null;
  for (const z of entfalte(ics)) {
    if (z === 'BEGIN:VEVENT') ev = {};
    else if (z === 'END:VEVENT' && ev) {
      const a = ev.DTSTART ? icsZeit(ev.DTSTART) : null;
      if (a && ev.TRANSP !== 'TRANSPARENT' && ev.STATUS !== 'CANCELLED') {
        const e = ev.DTEND ? icsZeit(ev.DTEND) : null;
        const ende = e?.zeit ?? new Date(a.zeit.getTime() + (a.ganztags ? 864e5 : dauerMs(ev.DURATION) ?? 3600_000));
        out.push({ starts_at: a.zeit.toISOString(), ends_at: ende.toISOString() });
      }
      ev = null;
    } else if (ev) {
      const name = z.split(/[;:]/)[0].toUpperCase();
      if (name === 'DTSTART' || name === 'DTEND') ev[name] = z;
      else if (name === 'TRANSP' || name === 'STATUS' || name === 'DURATION') ev[name] = z.slice(z.indexOf(':') + 1).trim().toUpperCase();
    }
  }
  return out;
}

function dauerMs(d?: string): number | null {
  const m = d?.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
  if (!m) return null;
  return ((+(m[1] ?? 0) * 24 + +(m[2] ?? 0)) * 60 + +(m[3] ?? 0)) * 60_000;
}

const icsUtc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

/** Termin als VCALENDAR (rein, testbar) */
export function baueIcs(uid: string, t: { start: Date; ende: Date; titel: string; beschreibung: string; ort?: string | null; gastEmail?: string | null; gastName?: string | null }, jetzt = new Date()): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Zoepp Media//Cloud//DE',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${icsUtc(jetzt)}`,
    `DTSTART:${icsUtc(t.start)}`,
    `DTEND:${icsUtc(t.ende)}`,
    `SUMMARY:${icsText(t.titel)}`,
    `DESCRIPTION:${icsText(t.beschreibung)}`,
    ...(t.ort ? [`LOCATION:${icsText(t.ort)}`] : []),
    ...(t.gastEmail ? [`ATTENDEE;CN=${icsText(t.gastName ?? t.gastEmail)};RSVP=TRUE:mailto:${t.gastEmail}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
    '',
  ].join('\r\n');
}

/** In einer vorhandenen .ics Start und Ende ersetzen (rein, testbar) */
export function verschiebeIcs(ics: string, start: Date, ende: Date): string {
  return entfalte(ics)
    .filter((z) => !/^DURATION[;:]/i.test(z))
    .map((z) => (/^DTSTART[;:]/i.test(z) ? `DTSTART:${icsUtc(start)}` : /^DTEND[;:]/i.test(z) ? `DTEND:${icsUtc(ende)}` : z))
    .join('\r\n');
}

/* ── CalDAV-Abrufe ───────────────────────────────────────────────────────────────────── */

const PROPFIND_PRINCIPAL = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:current-user-principal/></d:prop></d:propfind>';
const PROPFIND_HOME = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><c:calendar-home-set/></d:prop></d:propfind>';
const PROPFIND_KALENDER =
  '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav"><d:prop><d:resourcetype/><d:displayname/><d:current-user-privilege-set/><c:supported-calendar-component-set/></d:prop></d:propfind>';

/** Anmelden und Kalender finden (beim Verbinden) */
export async function entdeckeKalender(z: AppleZugang): Promise<{ home: string; kalender: AppleKalender[] }> {
  const p = await dav(z, ICLOUD_START, 'PROPFIND', PROPFIND_PRINCIPAL, { Depth: '0' });
  if (p.status !== 207) throw new Error(`iCloud antwortet nicht wie erwartet (${p.status})`);
  const principalHref = hrefIn(await p.text(), 'current-user-principal');
  if (!principalHref) throw new Error('iCloud-Konto ohne Kalender gefunden');
  const principal = new URL(principalHref, p.url || ICLOUD_START).toString();

  const h = await dav(z, principal, 'PROPFIND', PROPFIND_HOME, { Depth: '0' });
  const homeHref = hrefIn(await h.text(), 'calendar-home-set');
  if (!homeHref) throw new Error('Kalender-Verzeichnis in iCloud nicht gefunden');
  const home = new URL(homeHref, principal).toString();

  const k = await dav(z, home, 'PROPFIND', PROPFIND_KALENDER, { Depth: '1' });
  if (k.status !== 207) throw new Error(`Kalender nicht lesbar (${k.status})`);
  return { home, kalender: kalenderAusAntwort(await k.text(), home) };
}

/** Belegte Zeiten über alle Termin-Kalender des Kontos */
export async function appleBelegt(z: AppleZugang, home: string, von: Date, bis: Date): Promise<Array<{ starts_at: string; ends_at: string }>> {
  const k = await dav(z, home, 'PROPFIND', PROPFIND_KALENDER, { Depth: '1' });
  if (k.status !== 207) throw new Error(`Apple-Kalender ${k.status}`);
  const kalender = kalenderAusAntwort(await k.text(), home);
  const zeitraum = `start="${icsUtc(von)}" end="${icsUtc(bis)}"`;
  const report =
    '<?xml version="1.0" encoding="utf-8"?><c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">' +
    `<d:prop><c:calendar-data><c:expand ${zeitraum}/></c:calendar-data></d:prop>` +
    `<c:filter><c:comp-filter name="VCALENDAR"><c:comp-filter name="VEVENT"><c:time-range ${zeitraum}/></c:comp-filter></c:comp-filter></c:filter></c:calendar-query>`;
  const alle: Array<{ starts_at: string; ends_at: string }> = [];
  for (const kal of kalender) {
    const r = await dav(z, kal.url, 'REPORT', report, { Depth: '1' });
    if (r.status !== 207) throw new Error(`Apple-Kalender „${kal.name}“ ${r.status}`);
    for (const daten of [...(await r.text()).matchAll(tagAlle('calendar-data'))]) alle.push(...belegtAusIcs(entities(daten[1])));
  }
  // Nur, was den Zeitraum berührt (Serien-Reste ohne Auflösung fallen so nicht ins Gewicht)
  return alle.filter((b) => new Date(b.ends_at) > von && new Date(b.starts_at) < bis);
}

export async function appleEintragen(z: AppleZugang, kalenderUrl: string, t: Parameters<typeof baueIcs>[1]): Promise<string> {
  const uid = `${randomUUID()}@cloud.zoeppmedia.de`;
  const ziel = new URL(`${encodeURIComponent(uid)}.ics`, kalenderUrl.endsWith('/') ? kalenderUrl : `${kalenderUrl}/`).toString();
  const res = await dav(z, ziel, 'PUT', baueIcs(uid, t), { 'If-None-Match': '*' });
  if (res.status !== 201 && res.status !== 204) throw new Error(`Termin nicht im Apple-Kalender eingetragen (${res.status})`);
  return ziel;
}

export async function appleLoeschen(z: AppleZugang, href: string): Promise<void> {
  const res = await dav(z, href, 'DELETE');
  if (!res.ok && res.status !== 404) throw new Error(`Termin im Apple-Kalender nicht gelöscht (${res.status})`);
}

export async function appleVerschieben(z: AppleZugang, href: string, start: Date, ende: Date): Promise<void> {
  const alt = await dav(z, href, 'GET');
  if (!alt.ok) throw new Error(`Termin im Apple-Kalender nicht gefunden (${alt.status})`);
  const etag = alt.headers.get('etag');
  const res = await dav(z, href, 'PUT', verschiebeIcs(await alt.text(), start, ende), etag ? { 'If-Match': etag } : {});
  if (res.status !== 201 && res.status !== 204) throw new Error(`Termin im Apple-Kalender nicht verschoben (${res.status})`);
}
