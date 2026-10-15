import type { SupabaseClient } from '@supabase/supabase-js';
import { oeffentlicheBasis, twilioRestConfig } from './config';
import { signaturGueltig } from './signatur';

/**
 * WhatsApp-Nummer je Kunde: Twilio-REST (Unterkonto, Unterlagen, Nummernsuche, Kauf) + Datenbank.
 * Zugangsdaten nur aus Vercel (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN). Das Token eines Unterkontos wird
 * bei Bedarf mit dem Hauptkonto abgefragt und nur kurz im Speicher gehalten – nie gespeichert oder geloggt.
 */

export const NICHT_EINGERICHTET = 'Twilio ist noch nicht eingerichtet';
export const SCHEMA_FEHLT = 'Datenbank-Änderung fehlt noch';

const API = 'https://api.twilio.com/2010-04-01';
const NUMBERS = 'https://numbers.twilio.com/v2';
const PRICING = 'https://pricing.twilio.com/v1';

export interface NummernEintrag {
  id: string;
  agency_id: string;
  twilio_subaccount_sid: string | null;
  phone_number_sid: string | null;
  nummer_e164: string | null;
  bundle_sid: string | null;
  address_sid: string | null;
  status: 'unterkonto' | 'gekauft';
  code_empfang_bis: string | null;
  gekauft_am: string | null;
  created_at: string;
}

export class TwilioFehler extends Error {}

type Zugang = { benutzer: string; passwort: string };

function basic(z: Zugang): string {
  return `Basic ${Buffer.from(`${z.benutzer}:${z.passwort}`).toString('base64')}`;
}

function hauptzugang(): Zugang & { accountSid: string } {
  const cfg = twilioRestConfig();
  if (!cfg) throw new TwilioFehler(NICHT_EINGERICHTET);
  return { benutzer: cfg.accountSid, passwort: cfg.authToken, accountSid: cfg.accountSid };
}

async function anfrage<T>(url: string, zugang: Zugang, opts: { method?: 'GET' | 'POST'; form?: Record<string, string> } = {}): Promise<T> {
  const res = await fetch(url, {
    method: opts.method ?? 'GET',
    headers: {
      Authorization: basic(zugang),
      ...(opts.form ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}),
    },
    body: opts.form ? new URLSearchParams(opts.form).toString() : undefined,
    cache: 'no-store',
  }).catch(() => null);
  if (!res) throw new TwilioFehler('Twilio ist gerade nicht erreichbar');
  const data = (await res.json().catch(() => ({}))) as { message?: string; code?: number };
  if (!res.ok) {
    if (res.status === 401) throw new TwilioFehler('Twilio lehnt die Zugangsdaten ab – bitte TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN in Vercel prüfen');
    throw new TwilioFehler(`Twilio meldet: ${data.message ?? `Fehler ${res.status}`}${data.code ? ` (Code ${data.code})` : ''}`);
  }
  return data as T;
}

// ---------------------------------------------------------------- Datenbank

/** Gibt es die Tabellen schon? (Migration 20261015000460) */
export async function nummernSchemaBereit(svc: SupabaseClient): Promise<boolean> {
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    svc.from('kunden_telefonnummern').select('id').limit(1),
    svc.from('nummer_codes').select('id').limit(1),
  ]);
  return !e1 && !e2;
}

export async function ladeEintrag(svc: SupabaseClient, agencyId: string): Promise<NummernEintrag | null> {
  const { data } = await svc.from('kunden_telefonnummern').select('*').eq('agency_id', agencyId).maybeSingle();
  return (data as NummernEintrag | null) ?? null;
}

// ---------------------------------------------------------------- Unterkonto

const tokenCache = new Map<string, { token: string; bis: number }>();

/** Auth-Token eines Unterkontos mit dem Hauptkonto abfragen (nur im Speicher, 5 Minuten) */
async function unterkontoToken(subSid: string): Promise<string> {
  const c = tokenCache.get(subSid);
  if (c && c.bis > Date.now()) return c.token;
  const haupt = hauptzugang();
  const acc = await anfrage<{ auth_token?: string; owner_account_sid?: string; status?: string }>(`${API}/Accounts/${encodeURIComponent(subSid)}.json`, haupt);
  if (!acc.auth_token) throw new TwilioFehler('Unterkonto nicht gefunden');
  if (acc.owner_account_sid && acc.owner_account_sid !== haupt.accountSid) throw new TwilioFehler('Unterkonto gehört nicht zum Hauptkonto');
  tokenCache.set(subSid, { token: acc.auth_token, bis: Date.now() + 5 * 60_000 });
  return acc.auth_token;
}

async function unterkontoZugang(subSid: string): Promise<Zugang> {
  return { benutzer: subSid, passwort: await unterkontoToken(subSid) };
}

export async function unterkontoAnlegen(kundenname: string): Promise<string> {
  const haupt = hauptzugang();
  const acc = await anfrage<{ sid?: string }>(`${API}/Accounts.json`, haupt, {
    method: 'POST',
    form: { FriendlyName: `Zoepp Cloud – ${kundenname}`.slice(0, 64) },
  });
  if (!acc.sid) throw new TwilioFehler('Twilio hat kein Unterkonto zurückgegeben');
  return acc.sid;
}

// ---------------------------------------------------------------- Unterlagen + Adressen

export interface Bundle {
  sid: string;
  friendly_name: string;
  status: string;
  valid_until: string | null;
}

/** Regulatory Bundles des Unterkontos für deutsche Ortsnetznummern */
export async function bundlesLaden(subSid: string): Promise<Bundle[]> {
  const z = await unterkontoZugang(subSid);
  const r = await anfrage<{ results?: Bundle[] }>(`${NUMBERS}/RegulatoryCompliance/Bundles?IsoCountry=DE&NumberType=local&PageSize=20`, z);
  return (r.results ?? []).map((b) => ({ sid: b.sid, friendly_name: b.friendly_name, status: b.status, valid_until: b.valid_until ?? null }));
}

export async function bundleLaden(subSid: string, bundleSid: string): Promise<Bundle> {
  const z = await unterkontoZugang(subSid);
  return anfrage<Bundle>(`${NUMBERS}/RegulatoryCompliance/Bundles/${encodeURIComponent(bundleSid)}`, z);
}

export interface Adresse {
  sid: string;
  customer_name: string;
  street: string;
  postal_code: string;
  city: string;
  iso_country: string;
}

/** Deutsche Adressen im Unterkonto (Pflicht beim Kauf einer Ortsnetznummer) */
export async function adressenLaden(subSid: string): Promise<Adresse[]> {
  const haupt = hauptzugang();
  const r = await anfrage<{ addresses?: Adresse[] }>(`${API}/Accounts/${encodeURIComponent(subSid)}/Addresses.json?IsoCountry=DE&PageSize=20`, haupt);
  return (r.addresses ?? []).map((a) => ({ sid: a.sid, customer_name: a.customer_name, street: a.street, postal_code: a.postal_code, city: a.city, iso_country: a.iso_country }));
}

// ---------------------------------------------------------------- Nummern

export interface FreieNummer {
  nummer: string;
  anzeige: string;
  ort: string | null;
  sms: boolean;
  adresse_noetig: string;
}

/** Freie Ortsnetznummern suchen (kostenlos, kauft nichts). Ohne Unterkonto über das Hauptkonto. */
export async function nummernSuchen(vorwahl: string, subSid?: string | null): Promise<FreieNummer[]> {
  const haupt = hauptzugang();
  const konto = subSid || haupt.accountSid;
  type Antwort = { available_phone_numbers?: Array<{ phone_number: string; friendly_name: string; locality: string | null; capabilities?: { SMS?: boolean; sms?: boolean }; address_requirements: string }> };
  // AreaCode gilt bei Twilio nur für USA/Kanada – außerhalb wird über Contains gesucht (mit und ohne „+“)
  let treffer: NonNullable<Antwort['available_phone_numbers']> = [];
  let fehler: unknown = null;
  let geklappt = false;
  for (const muster of [`+49${vorwahl}`, `49${vorwahl}`]) {
    const q = new URLSearchParams({ Contains: muster, VoiceEnabled: 'true', PageSize: '30' });
    try {
      const r = await anfrage<Antwort>(`${API}/Accounts/${encodeURIComponent(konto)}/AvailablePhoneNumbers/DE/Local.json?${q}`, haupt);
      treffer = (r.available_phone_numbers ?? []).filter((n) => n.phone_number.startsWith(`+49${vorwahl}`));
      geklappt = true;
      if (treffer.length) break;
    } catch (e) {
      fehler = e;
    }
  }
  if (!geklappt) throw fehler;
  return treffer
    .slice(0, 5)
    .map((n) => ({
      nummer: n.phone_number,
      anzeige: n.friendly_name || n.phone_number,
      ort: n.locality || null,
      sms: !!(n.capabilities?.SMS ?? n.capabilities?.sms),
      adresse_noetig: n.address_requirements,
    }));
}

/** Monatspreis einer deutschen Ortsnetznummer laut Twilio (null = nicht abrufbar) */
export async function monatspreis(): Promise<string | null> {
  try {
    const r = await anfrage<{ phone_number_prices?: Array<{ number_type: string; current_price: string }>; price_unit?: string }>(`${PRICING}/PhoneNumbers/Countries/DE`, hauptzugang());
    const p = r.phone_number_prices?.find((x) => x.number_type === 'local');
    return p ? `${Number(p.current_price).toFixed(2)} ${(r.price_unit ?? 'USD').toUpperCase()} pro Monat` : null;
  } catch {
    return null;
  }
}

/** Nummer im Unterkonto kaufen (kostet monatlich!) – Webhooks fangen Anruf/SMS für den Meta-Code ab */
export async function nummerKaufen(x: { subSid: string; nummer: string; bundleSid: string; addressSid: string; sms: boolean; name: string }): Promise<{ sid: string; nummer: string }> {
  const haupt = hauptzugang();
  const basis = oeffentlicheBasis();
  const form: Record<string, string> = {
    PhoneNumber: x.nummer,
    BundleSid: x.bundleSid,
    AddressSid: x.addressSid,
    FriendlyName: `WhatsApp – ${x.name}`.slice(0, 64),
    VoiceUrl: `${basis}/api/twilio/nummer/anruf`,
    VoiceMethod: 'POST',
  };
  if (x.sms) Object.assign(form, { SmsUrl: `${basis}/api/twilio/nummer/sms`, SmsMethod: 'POST' });
  const r = await anfrage<{ sid?: string; phone_number?: string }>(`${API}/Accounts/${encodeURIComponent(x.subSid)}/IncomingPhoneNumbers.json`, haupt, { method: 'POST', form });
  if (!r.sid || !r.phone_number) throw new TwilioFehler('Twilio hat den Kauf nicht bestätigt');
  return { sid: r.sid, nummer: r.phone_number };
}

// ---------------------------------------------------------------- Webhooks der Kundennummern

/**
 * Webhook einer Kundennummer lesen. Twilio signiert mit dem Token des Kontos, dem die Nummer gehört
 * (Unterkonto) – das Unterkonto muss bei uns hinterlegt sein. null = ungültig.
 */
export async function leseNummerWebhook(req: Request, svc: SupabaseClient): Promise<{ p: Record<string, string>; url: URL; eintrag: NummernEintrag } | null> {
  const haupt = twilioRestConfig();
  if (!haupt) return null;
  const url = new URL(req.url);
  const form = await req.formData().catch(() => null);
  if (!form) return null;
  const p: Record<string, string> = {};
  form.forEach((v, k) => {
    if (typeof v === 'string') p[k] = v;
  });
  const { data } = await svc.from('kunden_telefonnummern').select('*').eq('nummer_e164', p.To ?? '').maybeSingle();
  const eintrag = data as NummernEintrag | null;
  if (!eintrag?.twilio_subaccount_sid || p.AccountSid !== eintrag.twilio_subaccount_sid) return null;

  const signiert = `${oeffentlicheBasis()}${url.pathname}${url.search}`;
  const sig = req.headers.get('x-twilio-signature');
  if (signaturGueltig(haupt.authToken, signiert, p, sig)) return { p, url, eintrag };
  const token = await unterkontoToken(eintrag.twilio_subaccount_sid).catch(() => null);
  if (token && signaturGueltig(token, signiert, p, sig)) return { p, url, eintrag };
  return null;
}
