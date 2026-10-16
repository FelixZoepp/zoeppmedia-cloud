/**
 * Meta-Kosten je Kampagne und Tag aus den Werbekonten der Kunden (agencies.meta_ad_account_id)
 * → Tabelle meta_kampagnen_kosten (mit agency_id). Alle Kampagnen eines Werbekontos gehören zu diesem Kunden.
 * Täglich über /api/cron/daily, manuell über „Jetzt abgleichen“. Gegenüber Meta nur lesend.
 * Zugriff: Der Kunde muss den Zoepp-Systembenutzer bzw. das Zoepp-Business als Partner im Werbekonto hinzufügen.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { metaKundenToken, normalisiereAdAccount } from '@/lib/meta/ad-account';
import { istSchemaFehler } from '@/lib/appointments/termin-format';

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface KampagnenTag {
  campaign_id: string;
  campaign_name: string | null;
  datum: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
}

interface KampagneRoh {
  campaign_id?: string;
  campaign_name?: string;
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

const LEAD_AKTIONEN = ['lead', 'onsite_conversion.lead_grouped', 'offsite_conversion.fb_pixel_lead'];

/** Eine Insights-Zeile (level=campaign, time_increment=1) in eine Tageszeile übersetzen (rein) */
export function parseKampagnenZeile(r: KampagneRoh): KampagnenTag | null {
  if (!r.campaign_id || !r.date_start) return null;
  // Meta meldet dieselben Leads unter mehreren Aktionstypen – den größten Wert nehmen statt zu summieren
  const leads = Math.max(0, ...(r.actions ?? []).filter((a) => LEAD_AKTIONEN.includes(a.action_type)).map((a) => Number(a.value) || 0));
  return {
    campaign_id: r.campaign_id,
    campaign_name: r.campaign_name ?? null,
    datum: r.date_start,
    spend: Math.round((Number(r.spend) || 0) * 100) / 100,
    impressions: Number(r.impressions) || 0,
    clicks: Number(r.clicks) || 0,
    leads,
  };
}

export type FehlerArt = 'kein_zugriff' | 'token_ungueltig' | 'fehler';

/** Graph-Fehler einordnen (rein): fehlender Zugriff aufs Werbekonto vs. ungültiger Token vs. Sonstiges */
export function metaFehlerArt(e: { code?: number | null; message?: string | null }): FehlerArt {
  if (e.code === 190) return 'token_ungueltig';
  if ([10, 294].includes(e.code ?? -1) || ((e.code ?? 0) >= 200 && (e.code ?? 0) < 300)) return 'kein_zugriff';
  if (/permission|not authori[sz]ed|does not exist|cannot be loaded|missing|unsupported get request/i.test(e.message ?? '')) return 'kein_zugriff';
  return 'fehler';
}

export class MetaGraphFehler extends Error {
  art: FehlerArt;
  constructor(err: { code?: number; message?: string }) {
    super(err.message ?? 'Meta-Fehler');
    this.art = metaFehlerArt(err);
  }
}

/** GET auf die Graph-API mit Seiten (paging.next); wirft MetaGraphFehler */
async function graphAlle<T>(pfad: string, params: Record<string, string>, token: string, maxSeiten = 20): Promise<T[]> {
  const u = new URL(`${GRAPH}${pfad}`);
  u.searchParams.set('access_token', token);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  const out: T[] = [];
  let url: string | null = u.toString();
  for (let i = 0; url && i < maxSeiten; i++) {
    const res: Response = await fetch(url, { cache: 'no-store' });
    const d = (await res.json().catch(() => ({}))) as { data?: T[]; paging?: { next?: string }; error?: { code?: number; message?: string } };
    if (!res.ok || d.error) throw new MetaGraphFehler(d.error ?? { message: `HTTP ${res.status}` });
    out.push(...(d.data ?? []));
    url = d.paging?.next ?? null;
  }
  return out;
}

/** Insights je Kampagne und Tag eines Werbekontos */
export async function holeKampagnenTage(adAccount: string, von: string, bis: string, token: string): Promise<KampagnenTag[]> {
  const account = normalisiereAdAccount(adAccount);
  if (!account) return [];
  const rows = await graphAlle<KampagneRoh>(`/${account}/insights`, {
    level: 'campaign',
    fields: 'campaign_id,campaign_name,spend,impressions,clicks,actions',
    time_range: JSON.stringify({ since: von, until: bis }),
    time_increment: '1',
    limit: '500',
  }, token);
  return rows.map(parseKampagnenZeile).filter((z): z is KampagnenTag => !!z);
}

export type KundenSyncStatus = 'ok' | FehlerArt;

export interface KundenSync {
  agency_id: string;
  status: KundenSyncStatus;
  zeilen: number;
  meldung?: string;
}

export type SyncStatus = 'ok' | 'nicht_verbunden' | 'tabelle_fehlt' | 'kein_werbekonto';

export interface KampagnenSyncErgebnis {
  status: SyncStatus;
  kunden: KundenSync[];
  zeilen: number;
}

export const KUNDEN_MELDUNG: Record<KundenSyncStatus, string> = {
  ok: 'Abgeglichen',
  kein_zugriff: 'Kein Zugriff auf Werbekonto',
  token_ungueltig: 'Meta-Token ungültig',
  fehler: 'Abgleich fehlgeschlagen',
};

export const SYNC_MELDUNG: Record<SyncStatus, string> = {
  ok: 'Abgeglichen',
  nicht_verbunden: 'Meta nicht verbunden',
  tabelle_fehlt: 'Datenbank-Änderung fehlt noch',
  kein_werbekonto: 'Kein Werbekonto hinterlegt',
};

const tag = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });

/** Ergebnis des letzten Abgleichs je Kunde in settings.meta_sync merken (Anzeige „kein Zugriff“) */
async function merkeStatus(svc: SupabaseClient, agencyId: string, settings: unknown, s: KundenSync, jetzt: Date) {
  const alt = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>;
  await svc.from('agencies').update({ settings: { ...alt, meta_sync: { status: s.status, meldung: s.meldung ?? null, am: jetzt.toISOString() } } }).eq('id', agencyId);
}

/**
 * Letzte `tage` Tage (inkl. heute) für alle Kunden mit Werbekonto (oder nur `agencyId`) abgleichen.
 * Bestehende Tage werden überschrieben. Ein Fehler bei einem Kunden stoppt die anderen nicht.
 */
export async function syncKampagnenKosten(svc: SupabaseClient, opts: { tage?: number; jetzt?: Date; agencyId?: string } = {}): Promise<KampagnenSyncErgebnis> {
  const token = metaKundenToken();
  if (!token) return { status: 'nicht_verbunden', kunden: [], zeilen: 0 };
  const jetzt = opts.jetzt ?? new Date();
  const tage = Math.min(Math.max(opts.tage ?? 7, 1), 90);
  const von = tag(new Date(jetzt.getTime() - (tage - 1) * 864e5));
  const bis = tag(jetzt);

  let q = svc.from('agencies').select('id, meta_ad_account_id, settings').not('meta_ad_account_id', 'is', null);
  if (opts.agencyId) q = q.eq('id', opts.agencyId);
  const { data: agencies } = await q;
  const liste = ((agencies ?? []) as Array<{ id: string; meta_ad_account_id: string | null; settings: unknown }>).filter((a) => normalisiereAdAccount(a.meta_ad_account_id));
  if (!liste.length) return { status: 'kein_werbekonto', kunden: [], zeilen: 0 };

  const kunden: KundenSync[] = [];
  let summe = 0;
  for (const a of liste) {
    let s: KundenSync;
    try {
      const zeilen = await holeKampagnenTage(a.meta_ad_account_id!, von, bis, token);
      const fetched_at = jetzt.toISOString();
      for (let i = 0; i < zeilen.length; i += 500) {
        const { error } = await svc
          .from('meta_kampagnen_kosten')
          .upsert(zeilen.slice(i, i + 500).map((z) => ({ ...z, agency_id: a.id, fetched_at })), { onConflict: 'campaign_id,datum' });
        if (error) {
          if (istSchemaFehler(error)) return { status: 'tabelle_fehlt', kunden, zeilen: summe };
          throw new Error(error.message);
        }
      }
      summe += zeilen.length;
      s = { agency_id: a.id, status: 'ok', zeilen: zeilen.length };
    } catch (e) {
      s = { agency_id: a.id, status: e instanceof MetaGraphFehler ? e.art : 'fehler', zeilen: 0, meldung: e instanceof Error ? e.message.slice(0, 300) : undefined };
    }
    kunden.push(s);
    await merkeStatus(svc, a.id, a.settings, s, jetzt).catch(() => {});
  }
  return { status: 'ok', kunden, zeilen: summe };
}

/* ── Werbekonto prüfen / finden (Kundenakte → Integrationen) ───────────── */

const KONTO_STATUS: Record<number, string> = {
  1: 'Aktiv', 2: 'Deaktiviert', 3: 'Zahlung offen', 7: 'In Prüfung', 8: 'Abrechnung offen', 9: 'Kulanzzeit', 100: 'Wird geschlossen', 101: 'Geschlossen', 201: 'Aktiv', 202: 'Geschlossen',
};
export const kontoStatusText = (s: number | null | undefined) => (s == null ? 'Unbekannt' : KONTO_STATUS[s] ?? `Status ${s}`);

export interface Werbekonto {
  id: string;
  name: string | null;
  waehrung: string | null;
  status: string;
  aktiv: boolean;
  business: string | null;
}

type KontoRoh = { id: string; name?: string; currency?: string; account_status?: number; business_name?: string };
const KONTO_FELDER = 'id,name,currency,account_status,business_name';
const alsKonto = (k: KontoRoh): Werbekonto => ({
  id: normalisiereAdAccount(k.id) ?? k.id,
  name: k.name ?? null,
  waehrung: k.currency ?? null,
  status: kontoStatusText(k.account_status),
  aktiv: k.account_status === 1 || k.account_status === 201,
  business: k.business_name ?? null,
});

export type PruefErgebnis = { ok: true; konto: Werbekonto } | { ok: false; art: FehlerArt | 'nicht_verbunden' | 'ungueltig'; meldung: string };

/** Werbekonto über den Systembenutzer-Token abrufen (Name, Währung, Status) */
export async function pruefeWerbekonto(eingabe: string): Promise<PruefErgebnis> {
  const token = metaKundenToken();
  if (!token) return { ok: false, art: 'nicht_verbunden', meldung: 'Meta nicht verbunden' };
  const account = normalisiereAdAccount(eingabe);
  if (!account || account === 'act_') return { ok: false, art: 'ungueltig', meldung: 'Ungültige Werbekonto-ID (act_…)' };
  const u = new URL(`${GRAPH}/${account}`);
  u.searchParams.set('access_token', token);
  u.searchParams.set('fields', KONTO_FELDER);
  const res = await fetch(u.toString(), { cache: 'no-store' });
  const d = (await res.json().catch(() => ({}))) as KontoRoh & { error?: { code?: number; message?: string } };
  if (!res.ok || d.error) {
    const art = metaFehlerArt(d.error ?? {});
    return { ok: false, art, meldung: art === 'kein_zugriff' ? 'Kein Zugriff auf Werbekonto' : art === 'token_ungueltig' ? 'Meta-Token ungültig' : (d.error?.message ?? 'Prüfung fehlgeschlagen') };
  }
  return { ok: true, konto: alsKonto(d) };
}

/** Alle Werbekonten, auf die der Token Zugriff hat (eigene + Kundenkonten der Businesses) */
export async function findeWerbekonten(): Promise<Werbekonto[] | null> {
  const token = metaKundenToken();
  if (!token) return null;
  const konten = new Map<string, Werbekonto>();
  const dazu = (l: KontoRoh[]) => l.forEach((k) => konten.set(alsKonto(k).id, alsKonto(k)));
  dazu(await graphAlle<KontoRoh>('/me/adaccounts', { fields: KONTO_FELDER, limit: '200' }, token, 5));
  // Business-Kundenkonten (Partnerzugriff) – fehlt die Berechtigung, bleibt es bei /me/adaccounts
  const businesses = await graphAlle<{ id: string }>('/me/businesses', { fields: 'id', limit: '50' }, token, 2).catch(() => []);
  for (const b of businesses) {
    for (const kante of ['client_ad_accounts', 'owned_ad_accounts']) {
      dazu(await graphAlle<KontoRoh>(`/${b.id}/${kante}`, { fields: KONTO_FELDER, limit: '200' }, token, 5).catch(() => []));
    }
  }
  return [...konten.values()].sort((a, b) => Number(b.aktiv) - Number(a.aktiv) || (a.name ?? '').localeCompare(b.name ?? '', 'de'));
}
