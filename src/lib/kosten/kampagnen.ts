/**
 * Zuordnung Meta-Kampagne → Kunde (+ optional Stelle).
 * Automatisch: Funnel-Leads (Perspective) bringen utm_campaign (= Meta-Kampagnen-ID) mit.
 * Manuell: Admin wählt die Kampagne in der Stelle bzw. Kundenakte.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { istSchemaFehler } from '@/lib/appointments/termin-format';

export interface Utm {
  campaign: string | null;
  adset: string | null;
  ad: string | null;
  source: string | null;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Wert aus String/Zahl oder Perspective-Feld { value } – unersetzte Platzhalter ({{campaign.id}}) zählen nicht */
function wert(v: unknown): string | null {
  const o = obj(v);
  const roh = o && 'value' in o ? o.value : v;
  const s = typeof roh === 'number' ? String(roh) : typeof roh === 'string' ? roh.trim() : '';
  if (!s || s.length > 300 || /\{\{|\}\}/.test(s)) return null;
  return s;
}

const SCHLUESSEL: Record<keyof Utm, string[]> = {
  campaign: ['utm_campaign', 'utmCampaign'],
  adset: ['utm_term', 'utmTerm'],
  ad: ['utm_content', 'utmContent'],
  source: ['utm_source', 'utmSource'],
};

function ausObjekt(o: Record<string, unknown> | null): Partial<Utm> {
  if (!o) return {};
  const out: Partial<Utm> = {};
  for (const [k, namen] of Object.entries(SCHLUESSEL) as Array<[keyof Utm, string[]]>) {
    for (const n of namen) {
      const w = wert(o[n]);
      if (w) {
        out[k] = w;
        break;
      }
    }
  }
  return out;
}

function ausUrl(v: unknown): Partial<Utm> {
  const s = wert(v);
  if (!s || !s.includes('utm_')) return {};
  try {
    const q = s.includes('?') ? s.slice(s.indexOf('?') + 1) : s;
    return ausObjekt(Object.fromEntries(new URLSearchParams(q).entries()));
  } catch {
    return {};
  }
}

/**
 * UTM-Werte aus dem Perspective-Webhook. Je nach Version unter body.meta, body.meta.utmParams,
 * body.utmParams, profile.utm_* oder als Query in einer URL. Null, wenn nichts dabei ist.
 */
export function extrahiereUtm(body: Record<string, unknown>): Utm | null {
  const meta = obj(body.meta);
  const profile = obj(body.profile);
  const quellen: Partial<Utm>[] = [
    ausObjekt(obj(meta?.utmParams)),
    ausObjekt(obj(meta?.utm)),
    ausObjekt(meta),
    ausObjekt(obj(body.utmParams)),
    ausObjekt(obj(body.utm)),
    ausObjekt(profile),
    ausObjekt(body),
    ausUrl(meta?.url),
    ausUrl(meta?.pageUrl),
    ausUrl(meta?.query),
    ausUrl(body.url),
  ];
  const utm: Utm = { campaign: null, adset: null, ad: null, source: null };
  for (const q of quellen) for (const k of Object.keys(utm) as Array<keyof Utm>) utm[k] ??= q[k] ?? null;
  return utm.campaign || utm.adset || utm.ad ? utm : null;
}

/** Meta-Kampagnen-IDs sind rein numerisch – nur solche werden automatisch zugeordnet */
export function istKampagnenId(v: string | null | undefined): v is string {
  return !!v && /^\d{6,25}$/.test(v);
}

/** Auto-Zuordnung zur Stelle nur, wenn der Kunde genau eine aktive Stelle hat – sonst bleibt die Kampagne beim Kunden */
export function autoStelle(aktiveStellen: string[]): string | null {
  return aktiveStellen.length === 1 ? aktiveStellen[0] : null;
}

/** Kampagne → Stelle. Der Kunde ergibt sich aus dem Werbekonto; agency_id wird zur Prüfung mitgeführt. */
export interface Zuordnung {
  campaign_id: string;
  agency_id: string;
  job_id: string;
  quelle: 'auto' | 'manuell';
  campaign_name?: string | null;
}

/** Bestehende Zuordnung einer Kampagne; null auch, wenn die Tabelle fehlt */
export async function ladeZuordnung(svc: SupabaseClient, campaignId: string): Promise<Zuordnung | null> {
  const { data, error } = await svc.from('meta_kampagnen_zuordnung').select('campaign_id, agency_id, job_id, quelle').eq('campaign_id', campaignId).maybeSingle();
  if (error) return null;
  return (data as Zuordnung | null) ?? null;
}

/** Automatische Zuordnung anlegen, falls es noch keine gibt (bestehende – auch manuelle – bleiben) */
export async function merkeAutoZuordnung(svc: SupabaseClient, z: Omit<Zuordnung, 'quelle'>): Promise<'angelegt' | 'vorhanden' | 'tabelle_fehlt' | 'fehler'> {
  const { data, error } = await svc
    .from('meta_kampagnen_zuordnung')
    .upsert({ ...z, quelle: 'auto' }, { onConflict: 'campaign_id', ignoreDuplicates: true })
    .select('campaign_id');
  if (error) return istSchemaFehler(error) ? 'tabelle_fehlt' : 'fehler';
  return (data ?? []).length ? 'angelegt' : 'vorhanden';
}

export interface BewerberKampagne {
  agency_id: string;
  meta_campaign: string | null;
  job_id: string | null;
}

export interface VorschlagErgebnis {
  neu: Array<Omit<Zuordnung, 'quelle'>>;
  /** Kampagnen, deren Bewerber auf mehrere Stellen (oder Kunden) verteilt sind – bleiben offen */
  mehrdeutig: string[];
}

/**
 * Zuordnungen aus vorhandenen Bewerbern ableiten (rein): eine Kampagne gehört zur Stelle, wenn alle
 * ihre Bewerber bei einem Kunden liegen und alle Bewerbungen auf dieselbe Stelle laufen.
 * `kampagnenKunde` (aus dem Abgleich): gehört die Kampagne laut Werbekonto einem anderen Kunden, wird sie übersprungen.
 */
export function zuordnungenAusBewerbern(rows: BewerberKampagne[], bestehend: Set<string>, kampagnenKunde: Map<string, string> = new Map()): VorschlagErgebnis {
  const proKampagne = new Map<string, { kunden: Set<string>; stellen: Set<string | null> }>();
  for (const r of rows) {
    if (!istKampagnenId(r.meta_campaign) || bestehend.has(r.meta_campaign)) continue;
    const x = proKampagne.get(r.meta_campaign) ?? { kunden: new Set(), stellen: new Set() };
    x.kunden.add(r.agency_id);
    x.stellen.add(r.job_id);
    proKampagne.set(r.meta_campaign, x);
  }
  const neu: VorschlagErgebnis['neu'] = [];
  const mehrdeutig: string[] = [];
  for (const [campaign_id, x] of proKampagne) {
    const kunde = [...x.kunden][0];
    const stellen = [...x.stellen];
    const laut = kampagnenKunde.get(campaign_id);
    if (x.kunden.size !== 1 || stellen.length !== 1 || !stellen[0] || (laut && laut !== kunde)) {
      mehrdeutig.push(campaign_id);
      continue;
    }
    neu.push({ campaign_id, agency_id: kunde, job_id: stellen[0] });
  }
  return { neu, mehrdeutig };
}

export interface KampagnenEintrag {
  campaign_id: string;
  name: string;
  ausgaben30: number;
  letzterTag: string | null;
  zuordnung: { job_id: string; job_title: string | null; quelle: 'auto' | 'manuell' } | null;
}

/** Kampagnen eines Kunden: aus dem Abgleich der letzten 30 Tage + alle zugeordneten */
export async function ladeKampagnenListe(svc: SupabaseClient, agencyId: string, jetzt: Date = new Date()): Promise<{ status: 'ok' | 'tabelle_fehlt'; kampagnen: KampagnenEintrag[] }> {
  const ab = new Date(jetzt.getTime() - 29 * 864e5).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
  const [kostenRes, zuRes] = await Promise.all([
    svc.from('meta_kampagnen_kosten').select('campaign_id, campaign_name, datum, spend').eq('agency_id', agencyId).gte('datum', ab).order('datum').limit(10000),
    svc.from('meta_kampagnen_zuordnung').select('campaign_id, job_id, quelle, campaign_name, jobs(title)').eq('agency_id', agencyId),
  ]);
  if (istSchemaFehler(kostenRes.error) || istSchemaFehler(zuRes.error)) return { status: 'tabelle_fehlt', kampagnen: [] };
  const liste = new Map<string, KampagnenEintrag>();
  const leer = (id: string, name: string | null): KampagnenEintrag => ({ campaign_id: id, name: name ?? id, ausgaben30: 0, letzterTag: null, zuordnung: null });
  for (const k of (kostenRes.data ?? []) as Array<{ campaign_id: string; campaign_name: string | null; datum: string; spend: number | string }>) {
    const e = liste.get(k.campaign_id) ?? leer(k.campaign_id, k.campaign_name);
    e.ausgaben30 = Math.round((e.ausgaben30 + (Number(k.spend) || 0)) * 100) / 100;
    if (Number(k.spend) > 0) e.letzterTag = k.datum;
    if (k.campaign_name) e.name = k.campaign_name;
    liste.set(k.campaign_id, e);
  }
  type ZuRoh = { campaign_id: string; job_id: string; quelle: 'auto' | 'manuell'; campaign_name: string | null; jobs: { title: string } | { title: string }[] | null };
  for (const z of (zuRes.data ?? []) as unknown as ZuRoh[]) {
    const e = liste.get(z.campaign_id) ?? leer(z.campaign_id, z.campaign_name);
    const job = Array.isArray(z.jobs) ? z.jobs[0] ?? null : z.jobs;
    e.zuordnung = { job_id: z.job_id, job_title: job?.title ?? null, quelle: z.quelle };
    liste.set(z.campaign_id, e);
  }
  return { status: 'ok', kampagnen: [...liste.values()].sort((a, b) => b.ausgaben30 - a.ausgaben30 || a.name.localeCompare(b.name, 'de')) };
}
