/**
 * Kalender des Kunden (Google Kalender oder Microsoft 365/Outlook) mit einem Klick verbinden (OAuth):
 * - belegte Zeiten lesen → freie Slots für Vorstellungsgespräch/Probetag
 * - Termine direkt im Kundenkalender eintragen (Bewerber als Gast eingeladen)
 * Env: GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, MICROSOFT_CLIENT_ID/MICROSOFT_CLIENT_SECRET
 * Redirect-URI: <APP_URL>/api/kalender/callback/google bzw. /microsoft
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret } from '@/lib/crypto';

export type KalenderProvider = 'google' | 'microsoft';

const APP_URL = () => process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
export const redirectUri = (p: KalenderProvider) => `${APP_URL()}/api/kalender/callback/${p}`;

export function providerBereit(p: KalenderProvider): boolean {
  return p === 'google' ? !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) : !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET);
}

/* ── State (gegen CSRF; bindet Kunde + Nutzer an den Rücksprung) ─────────────── */

function signiere(daten: string): string {
  const key = process.env.KALENDER_STATE_SECRET || process.env.CRON_SECRET;
  if (!key) throw new Error('KALENDER_STATE_SECRET fehlt');
  return createHmac('sha256', key).update(daten).digest('base64url');
}

export function baueState(agencyId: string, userId: string, jetzt = Date.now(), nonce = ''): string {
  const daten = Buffer.from(JSON.stringify({ a: agencyId, u: userId, t: jetzt, n: nonce })).toString('base64url');
  return `${daten}.${signiere(daten)}`;
}

export function pruefeState(state: string, jetzt = Date.now()): { agencyId: string; userId: string; nonce: string } | null {
  const [daten, sig] = state.split('.');
  if (!daten || !sig) return null;
  const soll = signiere(daten);
  if (sig.length !== soll.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(soll))) return null;
  try {
    const o = JSON.parse(Buffer.from(daten, 'base64url').toString()) as { a: string; u: string; t: number; n?: string };
    if (jetzt - o.t > 15 * 60_000) return null; // 15 Minuten gültig
    return { agencyId: o.a, userId: o.u, nonce: o.n ?? '' };
  } catch {
    return null;
  }
}

/* ── OAuth ───────────────────────────────────────────────────────────────── */

export function authUrl(p: KalenderProvider, state: string): string {
  if (p === 'google') {
    const q = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      redirect_uri: redirectUri(p),
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy',
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({
    client_id: process.env.MICROSOFT_CLIENT_ID ?? '',
    redirect_uri: redirectUri(p),
    response_type: 'code',
    response_mode: 'query',
    prompt: 'select_account',
    scope: 'offline_access openid email User.Read Calendars.ReadWrite',
    state,
  });
  return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${q}`;
}

interface TokenAntwort {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  id_token?: string;
}

async function tokenAnfrage(p: KalenderProvider, body: Record<string, string>): Promise<TokenAntwort> {
  const url = p === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  const creds =
    p === 'google'
      ? { client_id: process.env.GOOGLE_CLIENT_ID ?? '', client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '' }
      : { client_id: process.env.MICROSOFT_CLIENT_ID ?? '', client_secret: process.env.MICROSOFT_CLIENT_SECRET ?? '' };
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ ...creds, ...body }) });
  const j = (await res.json().catch(() => ({}))) as TokenAntwort & { error?: string; error_description?: string };
  if (!res.ok || !j.access_token) throw new Error(`Anmeldung beim Kalender fehlgeschlagen: ${j.error_description ?? j.error ?? res.status}`);
  return j;
}

function emailAusIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const o = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString()) as { email?: string; preferred_username?: string };
    return o.email ?? o.preferred_username ?? null;
  } catch {
    return null;
  }
}

/** Callback: Code tauschen und Verbindung speichern (alte Verbindung des Kunden wird deaktiviert) */
export async function verbindeKalender(svc: SupabaseClient, p: KalenderProvider, code: string, agencyId: string, userId: string): Promise<{ email: string | null }> {
  const t = await tokenAnfrage(p, { grant_type: 'authorization_code', code, redirect_uri: redirectUri(p) });
  if (!t.refresh_token) throw new Error('Kein dauerhafter Zugriff erteilt – bitte erneut verbinden und alle Berechtigungen bestätigen');
  const email = emailAusIdToken(t.id_token);
  // Wechsel ohne Lücke: neue Verbindung erst inaktiv speichern, dann umschalten
  const { data: neu, error } = await svc.from('kalender_verbindungen').insert({
    aktiv: false,
    agency_id: agencyId,
    provider: p,
    konto_email: email,
    refresh_token_enc: encryptSecret(t.refresh_token),
    access_token_enc: encryptSecret(t.access_token),
    access_bis: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
    verbunden_von: userId,
  }).select('id').single();
  if (error || !neu) throw new Error(`Kalender nicht gespeichert: ${error?.message ?? ''}`);
  await svc.from('kalender_verbindungen').update({ aktiv: false, updated_at: new Date().toISOString() }).eq('agency_id', agencyId).eq('aktiv', true);
  const { error: aErr } = await svc.from('kalender_verbindungen').update({ aktiv: true, updated_at: new Date().toISOString() }).eq('id', (neu as { id: string }).id);
  if (aErr) throw new Error(`Kalender nicht aktiviert: ${aErr.message}`);
  return { email };
}

interface Verbindung {
  id: string;
  provider: KalenderProvider;
  kalender_id: string;
  refresh_token_enc: string;
  access_token_enc: string | null;
  access_bis: string | null;
  konto_email: string | null;
}

export async function ladeVerbindung(svc: SupabaseClient, agencyId: string): Promise<Verbindung | null> {
  const { data } = await svc.from('kalender_verbindungen').select('id, provider, kalender_id, refresh_token_enc, access_token_enc, access_bis, konto_email').eq('agency_id', agencyId).eq('aktiv', true).maybeSingle();
  return (data as Verbindung | null) ?? null;
}

async function zugriff(svc: SupabaseClient, v: Verbindung): Promise<string> {
  if (v.access_token_enc && v.access_bis && new Date(v.access_bis).getTime() > Date.now()) return decryptSecret(v.access_token_enc);
  try {
    const t = await tokenAnfrage(v.provider, { grant_type: 'refresh_token', refresh_token: decryptSecret(v.refresh_token_enc) });
    await svc
      .from('kalender_verbindungen')
      .update({
        access_token_enc: encryptSecret(t.access_token),
        access_bis: new Date(Date.now() + (t.expires_in - 60) * 1000).toISOString(),
        ...(t.refresh_token ? { refresh_token_enc: encryptSecret(t.refresh_token) } : {}),
        fehler: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', v.id);
    return t.access_token;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await svc.from('kalender_verbindungen').update({ fehler: msg.slice(0, 300), updated_at: new Date().toISOString() }).eq('id', v.id);
    throw e;
  }
}

/* ── Belegte Zeiten + Termine ─────────────────────────────────────────────── */

export async function belegteZeiten(svc: SupabaseClient, agencyId: string, von: Date, bis: Date): Promise<Array<{ starts_at: string; ends_at: string }> | null> {
  const v = await ladeVerbindung(svc, agencyId);
  if (!v) return null;
  const token = await zugriff(svc, v);
  if (v.provider === 'google') {
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: von.toISOString(), timeMax: bis.toISOString(), items: [{ id: v.kalender_id }] }),
    });
    if (!res.ok) throw new Error(`Google-Kalender ${res.status}`);
    const j = (await res.json()) as { calendars?: Record<string, { busy?: Array<{ start: string; end: string }>; errors?: unknown[] }> };
    const kal = j.calendars?.[v.kalender_id];
    if (!kal || kal.errors?.length) throw new Error('Google-Kalender liefert keine Belegung');
    return (kal.busy ?? []).map((b) => ({ starts_at: b.start, ends_at: b.end }));
  }
  const q = new URLSearchParams({ startDateTime: von.toISOString(), endDateTime: bis.toISOString(), $select: 'start,end,showAs', $top: '500' });
  const alle: Array<{ start: { dateTime: string }; end: { dateTime: string }; showAs?: string }> = [];
  let url: string | null = `https://graph.microsoft.com/v1.0/me/calendarView?${q}`;
  for (let seite = 0; url && seite < 10; seite++) {
    const res: Response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } });
    if (!res.ok) throw new Error(`Outlook-Kalender ${res.status}`);
    const j = (await res.json()) as { value?: typeof alle; '@odata.nextLink'?: string };
    alle.push(...(j.value ?? []));
    url = j['@odata.nextLink'] ?? null;
  }
  return alle.filter((e) => e.showAs !== 'free').map((e) => ({ starts_at: `${e.start.dateTime.replace(/Z?$/, 'Z')}`, ends_at: `${e.end.dateTime.replace(/Z?$/, 'Z')}` }));
}

export async function trageTerminEin(
  svc: SupabaseClient,
  agencyId: string,
  eingabe: { start: Date; ende: Date; titel: string; beschreibung: string; ort?: string | null; gastEmail?: string | null; gastName?: string | null },
): Promise<{ eventId: string; provider: KalenderProvider } | null> {
  let t = eingabe;
  const v = await ladeVerbindung(svc, agencyId);
  if (!v) return null;
  // Einladung an den Bewerber (Gast) nur bei freigegebenem Bewerber-Kontakt
  if (t.gastEmail) {
    const { ladeSchalter, darfKontakt } = await import('@/lib/recruiting/kontakt-schalter');
    if (!darfKontakt(await ladeSchalter(svc), { email: t.gastEmail, agencyId })) t = { ...t, gastEmail: null };
  }
  const token = await zugriff(svc, v);
  if (v.provider === 'google') {
    const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(v.kalender_id)}/events?sendUpdates=${t.gastEmail ? 'all' : 'none'}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        summary: t.titel,
        description: t.beschreibung,
        location: t.ort ?? undefined,
        start: { dateTime: t.start.toISOString() },
        end: { dateTime: t.ende.toISOString() },
        attendees: t.gastEmail ? [{ email: t.gastEmail, displayName: t.gastName ?? undefined }] : undefined,
      }),
    });
    if (!res.ok) throw new Error(`Termin nicht im Google-Kalender eingetragen (${res.status})`);
    return { eventId: ((await res.json()) as { id: string }).id, provider: 'google' };
  }
  const res = await fetch('https://graph.microsoft.com/v1.0/me/events', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: t.titel,
      body: { contentType: 'text', content: t.beschreibung },
      location: t.ort ? { displayName: t.ort } : undefined,
      start: { dateTime: t.start.toISOString().replace('Z', ''), timeZone: 'UTC' },
      end: { dateTime: t.ende.toISOString().replace('Z', ''), timeZone: 'UTC' },
      attendees: t.gastEmail ? [{ emailAddress: { address: t.gastEmail, name: t.gastName ?? t.gastEmail }, type: 'required' }] : undefined,
    }),
  });
  if (!res.ok) throw new Error(`Termin nicht im Outlook-Kalender eingetragen (${res.status})`);
  return { eventId: ((await res.json()) as { id: string }).id, provider: 'microsoft' };
}

export async function loescheTermin(svc: SupabaseClient, agencyId: string, eventId: string, provider: KalenderProvider): Promise<void> {
  const v = await ladeVerbindung(svc, agencyId);
  if (!v || v.provider !== provider) return;
  const token = await zugriff(svc, v);
  const url =
    provider === 'google'
      ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(v.kalender_id)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`
      : `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`;
  await fetch(url, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

/** Termin im Kundenkalender verschieben (neue Zeiten, ohne Mails an Gäste) */
export async function aktualisiereTermin(svc: SupabaseClient, agencyId: string, eventId: string, provider: KalenderProvider, start: Date, ende: Date): Promise<void> {
  const v = await ladeVerbindung(svc, agencyId);
  if (!v || v.provider !== provider) return;
  const token = await zugriff(svc, v);
  const res =
    provider === 'google'
      ? await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(v.kalender_id)}/events/${encodeURIComponent(eventId)}?sendUpdates=none`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: { dateTime: start.toISOString() }, end: { dateTime: ende.toISOString() } }),
        })
      : await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ start: { dateTime: start.toISOString().replace('Z', ''), timeZone: 'UTC' }, end: { dateTime: ende.toISOString().replace('Z', ''), timeZone: 'UTC' } }),
        });
  if (!res.ok) throw new Error(`Termin im Kundenkalender nicht verschoben (${res.status})`);
}

/**
 * Freie Zeiten für ein Gespräch: Arbeitszeit Mo–Fr 9–18 Uhr (Berlin), Dauer `minuten`, mind. 2 h Vorlauf,
 * belegte Zeiten aus dem Kundenkalender ausgespart (rein, testbar).
 */
export function freieZeiten(belegt: Array<{ starts_at: string; ends_at: string }>, opts: { von: Date; tage: number; minuten: number; jetzt?: Date; start?: number; ende?: number }): Array<{ start: Date; ende: Date }> {
  const jetzt = opts.jetzt ?? new Date();
  const frueh = jetzt.getTime() + 2 * 3600_000;
  const raster = 30 * 60_000;
  const dauer = opts.minuten * 60_000;
  const busy = belegt.map((b) => [new Date(b.starts_at).getTime(), new Date(b.ends_at).getTime()] as const);
  const out: Array<{ start: Date; ende: Date }> = [];
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  let t = Math.ceil(opts.von.getTime() / raster) * raster;
  const bis = opts.von.getTime() + opts.tage * 864e5;
  for (; t < bis && out.length < 60; t += raster) {
    if (t < frueh) continue;
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    if (p.weekday === 'Sat' || p.weekday === 'Sun') continue;
    const m = Number(p.hour) * 60 + Number(p.minute);
    if (m < (opts.start ?? 540) || m + opts.minuten > (opts.ende ?? 1080)) continue;
    const e = t + dauer;
    if (busy.some(([a, b]) => t < b && e > a)) continue;
    out.push({ start: new Date(t), ende: new Date(e) });
  }
  return out;
}
