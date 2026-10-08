/**
 * Meta-Kampagne per API anlegen – aus den vom Kunden freigegebenen Ads.
 *
 * Ablauf: Kampagne → Anzeigengruppe → Bilder/Videos hochladen → Creative → Anzeige.
 * ALLES wird PAUSIERT angelegt. Geld fließt erst mit `aktiviereKampagne` – per Knopf
 * „Kampagne starten“ oder automatisch, wenn beim Kunden `settings.kampagne_autostart` an ist
 * UND der Test-Lead erfolgreich war.
 *
 * Idempotent: Kampagne/Anzeigengruppe je Kunde in `meta_kampagnen`, Meta-IDs je Ad in `ad_items`.
 *
 * Stellenanzeigen laufen als Sonderkategorie EMPLOYMENT (Land DE): kein Alters-/Geschlechts-
 * Targeting, keine Detail-Zielgruppen, Orte nur mit mind. 25 km Radius.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { MetaApiError, META_ACT, metaRequest } from './api';
import { isSignalSatisfied, resolveOwner, setStepStatus } from '@/lib/fulfillment/engine';
import { bausteineVon } from '@/lib/fulfillment/pakete';
import { createNotification } from '@/lib/notifications/create';
import { AD_ASSET_BUCKET } from '@/lib/ads/constants';
import type { ZugangPruefung } from './zugaenge';

/** Meta verlangt bei EMPLOYMENT mindestens 15 Meilen Radius um Städte */
export const MIN_RADIUS_KM = 25;
const MIN_TAGESBUDGET = 5;
const META_TYPEN = ['grafik', 'video', 'reel'] as const;

export interface KampagneDeps {
  /** Signierte URL für Dateien im Bucket ad-assets (Meta lädt sie selbst herunter) */
  signUrl?: (path: string) => Promise<string | null>;
  now?: Date;
}

interface AgencyRow {
  id: string;
  name: string;
  meta_ad_account_id: string | null;
  meta_page_id: string | null;
  meta_pixel_id: string | null;
  werbebudget: number | string | null;
  settings: Record<string, unknown> | null;
  bausteine: unknown;
  meta_zugang_pruefung: ZugangPruefung | null;
}

export interface KampagneRow {
  agency_id: string;
  campaign_id: string | null;
  adset_id: string | null;
  status: 'angelegt' | 'aktiv' | 'fehler';
  ziel: string | null;
  tagesbudget: number | null;
  fehler: string | null;
  in_arbeit_seit: string | null;
  angelegt_am: string | null;
  aktiviert_am: string | null;
}

interface AdRow {
  id: string;
  titel: string;
  idee: string | null;
  typ: string;
  stage: string;
  asset_path: string | null;
  asset_url: string | null;
  inhalt: Record<string, unknown> | null;
  meta_ad_id: string | null;
  meta_creative_id: string | null;
  meta_video_id: string | null;
}

export interface Voraussetzungen {
  bereit: boolean;
  fehlt: string[];
  funnelUrl: string | null;
  tagesbudget: number | null;
}

const fehlerText = (err: unknown) => (err instanceof MetaApiError ? err.meldung : err instanceof Error ? err.message : 'Fehler');

async function ladeAgency(svc: SupabaseClient, agencyId: string): Promise<AgencyRow> {
  const { data } = await svc
    .from('agencies')
    .select('id, name, meta_ad_account_id, meta_page_id, meta_pixel_id, werbebudget, settings, bausteine, meta_zugang_pruefung')
    .eq('id', agencyId)
    .maybeSingle();
  if (!data) throw new Error('Kunde nicht gefunden');
  return data as AgencyRow;
}

async function ladeOnboarding(svc: SupabaseClient, agencyId: string): Promise<Record<string, unknown> | null> {
  const { data } = await svc.from('onboarding_submissions').select('*').eq('agency_id', agencyId).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function ladeFunnelUrl(svc: SupabaseClient, agencyId: string): Promise<string | null> {
  const { data } = await svc.from('perspective_funnels').select('url, status').eq('agency_id', agencyId).order('updated_at', { ascending: false }).limit(5);
  const liste = ((data ?? []) as Array<{ url: string | null; status: string }>).filter((f) => f.url && /^https?:\/\//.test(f.url));
  return (liste.find((f) => f.status === 'published') ?? liste[0])?.url ?? null;
}

/** Tagesbudget in EUR: Onboarding-Angabe, sonst Monatsbudget aus dem Abschluss / 30 */
export function tagesbudgetAus(onboarding: Record<string, unknown> | null, werbebudgetMonat: number | string | null): number | null {
  const tag = Number(onboarding?.meta_daily_budget);
  if (Number.isFinite(tag) && tag > 0) return Math.round(tag * 100) / 100;
  const monat = Number(werbebudgetMonat);
  if (Number.isFinite(monat) && monat > 0) return Math.round((monat / 30) * 100) / 100;
  return null;
}

/** Regionen aus dem Onboarding (regions[] bevorzugt, sonst region als Komma-Liste) */
export function regionenAus(onboarding: Record<string, unknown> | null): string[] {
  const liste = Array.isArray(onboarding?.regions) ? (onboarding!.regions as unknown[]) : String(onboarding?.region ?? '').split(/[,;/]/);
  return [...new Set(liste.map((r) => String(r ?? '').trim()).filter(Boolean))].slice(0, 10);
}

function zugangOk(pruefung: ZugangPruefung | null, key: string): boolean {
  return !!pruefung?.ergebnisse?.some((e) => e.step_key === key && e.status === 'ok');
}

/**
 * Freigegebene Ads, die als Meta-Anzeige taugen (Grafik/Video mit Datei).
 * Nur Stage „bereit“ – schon „live“ gestellte Ads (z. B. von Hand im Werbemanager) werden nie doppelt angelegt.
 */
async function ladeAds(svc: SupabaseClient, agencyId: string, stages: string[]): Promise<AdRow[]> {
  const { data } = await svc
    .from('ad_items')
    .select('id, titel, idee, typ, stage, asset_path, asset_url, inhalt, meta_ad_id, meta_creative_id, meta_video_id')
    .eq('agency_id', agencyId)
    .in('stage', stages)
    .in('typ', [...META_TYPEN]);
  return ((data ?? []) as AdRow[]).filter((a) => a.asset_path || a.asset_url);
}

export async function pruefeVoraussetzungen(svc: SupabaseClient, agencyId: string): Promise<Voraussetzungen> {
  const agency = await ladeAgency(svc, agencyId);
  const [onboarding, funnelUrl, freigegeben, ads] = await Promise.all([
    ladeOnboarding(svc, agencyId),
    ladeFunnelUrl(svc, agencyId),
    isSignalSatisfied(svc, agencyId, 'ads_freigegeben'),
    ladeAds(svc, agencyId, ['bereit']),
  ]);
  const tagesbudget = tagesbudgetAus(onboarding, agency.werbebudget);
  const fehlt: string[] = [];
  if (!bausteineVon(agency.bausteine).includes('meta')) fehlt.push('Kunde hat keinen Meta-Baustein gebucht');
  if (!agency.meta_ad_account_id) fehlt.push('Werbekonto-ID fehlt');
  if (!agency.meta_page_id) fehlt.push('Facebook-Seite fehlt (Zugänge prüfen)');
  for (const [key, label] of [['o_meta_werbekonto', 'Werbekonto'], ['o_meta_zahlung', 'Zahlungsmethode'], ['o_meta_seite', 'Facebook-Seite']] as const) {
    if (!zugangOk(agency.meta_zugang_pruefung, key)) fehlt.push(`Zugang „${label}“ noch nicht per API bestätigt`);
  }
  if (!freigegeben) fehlt.push('Kunde hat noch nicht alle Ads freigegeben');
  if (!ads.length) fehlt.push('Keine freigegebene Grafik/Video mit Datei');
  if (!funnelUrl) fehlt.push('Keine Funnel-URL (Perspective) hinterlegt');
  if (!tagesbudget) fehlt.push('Kein Werbebudget (Onboarding oder Abschluss)');
  else if (tagesbudget < MIN_TAGESBUDGET) fehlt.push(`Tagesbudget unter ${MIN_TAGESBUDGET} €`);
  return { bereit: fehlt.length === 0, fehlt, funnelUrl, tagesbudget };
}

/** Regionen → Meta-Geo-Targeting (Städte mit Radius ≥ 25 km, Bundesländer ohne Radius), sonst ganz DE */
export async function geoTargeting(regionen: string[], radiusKm: number | null): Promise<{ geo: Record<string, unknown>; nichtGefunden: string[] }> {
  const radius = Math.max(MIN_RADIUS_KM, Math.min(80, Number(radiusKm) || MIN_RADIUS_KM));
  const cities: Array<Record<string, unknown>> = [];
  const regions: Array<Record<string, unknown>> = [];
  const nichtGefunden: string[] = [];
  for (const q of regionen) {
    const res = await metaRequest<{ data?: Array<{ key: string; type: string }> }>('/search', {
      params: { type: 'adgeolocation', q, country_code: 'DE', location_types: JSON.stringify(['city', 'region']), limit: '1' },
    });
    const treffer = res.data?.[0];
    if (!treffer) nichtGefunden.push(q);
    else if (treffer.type === 'region') regions.push({ key: treffer.key });
    else cities.push({ key: treffer.key, radius, distance_unit: 'kilometer' });
  }
  if (!cities.length && !regions.length) return { geo: { countries: ['DE'] }, nichtGefunden };
  return {
    geo: { ...(cities.length ? { cities } : {}), ...(regions.length ? { regions } : {}), location_types: ['home', 'recent'] },
    nichtGefunden,
  };
}

function texteAus(ad: AdRow): { primaertext: string; ueberschrift: string; beschreibung: string } {
  const i = (ad.inhalt ?? {}) as Record<string, unknown>;
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  return {
    primaertext: s(i.primaertext) || s(i.hook) || s(ad.idee) || ad.titel,
    ueberschrift: (s(i.ueberschrift) || ad.titel).slice(0, 40),
    beschreibung: s(i.beschreibung).slice(0, 30),
  };
}

async function dateiUrl(ad: AdRow, svc: SupabaseClient, deps: KampagneDeps): Promise<string | null> {
  if (ad.asset_path) {
    if (deps.signUrl) return deps.signUrl(ad.asset_path);
    const { data } = await svc.storage.from(AD_ASSET_BUCKET).createSignedUrl(ad.asset_path, 3600);
    return data?.signedUrl ?? null;
  }
  return ad.asset_url && /^https?:\/\//.test(ad.asset_url) ? ad.asset_url : null;
}

/** Interne Aufgabe + Benachrichtigung an Media Buyer (eine offene Aufgabe je Titel) */
async function meldeFehler(svc: SupabaseClient, agencyId: string, kunde: string, titel: string, text: string) {
  const { data: offen } = await svc.from('internal_tasks').select('id').eq('agency_id', agencyId).eq('title', titel).neq('status', 'done').limit(1);
  if (!(offen ?? []).length) {
    await svc.from('internal_tasks').insert({ title: titel, description: `${kunde}\n\n${text}`, agency_id: agencyId, status: 'todo', priority: 'high' });
  }
  const owner = await resolveOwner(svc, 'media_buyer');
  if (owner) {
    await createNotification(svc, {
      user_id: owner,
      agency_id: agencyId,
      title: titel,
      body: `${kunde} – ${text}`.slice(0, 300),
      type: 'system',
      entity_type: 'agency',
      entity_id: agencyId,
      push_url: `/clients/${agencyId}/ablauf`,
    }).catch(() => {});
  }
}

async function hakeAb(svc: SupabaseClient, agencyId: string, keys: string[], kommentar: string, userId?: string | null) {
  const { data } = await svc.from('client_steps').select('id').eq('agency_id', agencyId).in('step_key', keys).not('status', 'in', '(erledigt,nicht_noetig)');
  for (const row of (data ?? []) as Array<{ id: string }>) {
    await setStepStatus(svc, row.id, 'erledigt', { userId: userId ?? null, kommentar });
  }
}

async function ladeKampagne(svc: SupabaseClient, agencyId: string): Promise<KampagneRow | null> {
  const { data } = await svc.from('meta_kampagnen').select('*').eq('agency_id', agencyId).maybeSingle();
  return (data as KampagneRow | null) ?? null;
}

export interface AnlageErgebnis {
  ok: boolean;
  fehlt?: string[];
  fehler?: string;
  campaign_id?: string | null;
  adset_id?: string | null;
  neueAnzeigen: number;
  uebersprungen: Array<{ ad_id: string; grund: string }>;
  hinweise: string[];
}

/**
 * Kampagne (pausiert) anlegen bzw. vervollständigen. Mehrfach aufrufbar:
 * vorhandene Kampagne/Anzeigengruppe/Anzeigen werden nicht doppelt angelegt.
 */
export async function legeKampagneAn(
  svc: SupabaseClient,
  agencyId: string,
  opts: KampagneDeps & { userId?: string | null } = {},
): Promise<AnlageErgebnis> {
  const now = opts.now ?? new Date();
  const ergebnis: AnlageErgebnis = { ok: false, neueAnzeigen: 0, uebersprungen: [], hinweise: [] };

  const v = await pruefeVoraussetzungen(svc, agencyId);
  if (!v.bereit) return { ...ergebnis, fehlt: v.fehlt };
  const agency = await ladeAgency(svc, agencyId);
  const act = agency.meta_ad_account_id!;

  // Einfache Sperre gegen parallele Läufe (10 Minuten)
  let k = await ladeKampagne(svc, agencyId);
  const sperre = new Date(now.getTime() - 10 * 60_000).toISOString();
  if (k?.in_arbeit_seit && k.in_arbeit_seit > sperre) return { ...ergebnis, fehler: 'Anlage läuft bereits' };
  if (!k) {
    await svc.from('meta_kampagnen').upsert({ agency_id: agencyId, status: 'angelegt', in_arbeit_seit: now.toISOString(), updated_at: now.toISOString() }, { onConflict: 'agency_id', ignoreDuplicates: true });
    k = await ladeKampagne(svc, agencyId);
  } else {
    await svc.from('meta_kampagnen').update({ in_arbeit_seit: now.toISOString() }).eq('agency_id', agencyId);
  }
  if (!k) return { ...ergebnis, fehler: 'Kampagnen-Datensatz nicht anlegbar' };

  const mitPixel = !!agency.meta_pixel_id;
  const ziel = mitPixel ? 'OUTCOME_LEADS' : 'OUTCOME_TRAFFIC';
  if (!mitPixel) ergebnis.hinweise.push('Kein Pixel gefunden – Kampagne optimiert auf Landingpage-Aufrufe statt auf Leads.');

  try {
    // 1. Kampagne (Budget auf Kampagnenebene, Sonderkategorie Beschäftigung)
    let campaignId = k.campaign_id;
    if (!campaignId) {
      const res = await metaRequest<{ id: string }>(`${META_ACT(act)}/campaigns`, {
        method: 'POST',
        body: {
          name: `Recruiting – ${agency.name}`,
          objective: ziel,
          status: 'PAUSED',
          buying_type: 'AUCTION',
          special_ad_categories: ['EMPLOYMENT'],
          special_ad_category_country: ['DE'],
          daily_budget: Math.round(v.tagesbudget! * 100),
          bid_strategy: 'LOWEST_COST_WITHOUT_CAP',
        },
      });
      campaignId = res.id;
      await svc.from('meta_kampagnen').update({ campaign_id: campaignId, ziel, tagesbudget: v.tagesbudget, updated_at: now.toISOString() }).eq('agency_id', agencyId);
    }

    // 2. Anzeigengruppe (Ort aus dem Onboarding, Sonderkategorie-konformes Targeting)
    let adsetId = k.adset_id;
    if (!adsetId) {
      const onboarding = await ladeOnboarding(svc, agencyId);
      const { geo, nichtGefunden } = await geoTargeting(regionenAus(onboarding), (onboarding?.radius_km as number | null) ?? null);
      if (nichtGefunden.length) ergebnis.hinweise.push(`Orte nicht gefunden: ${nichtGefunden.join(', ')}`);
      if ('countries' in geo) ergebnis.hinweise.push('Keine Region aus dem Onboarding erkannt – Kampagne zielt auf ganz Deutschland. Bitte vor dem Start prüfen.');
      const targeting = { geo_locations: geo, age_min: 18, age_max: 65 };
      const res = await metaRequest<{ id: string }>(`${META_ACT(act)}/adsets`, {
        method: 'POST',
        body: {
          name: `Bewerber – ${agency.name}`,
          campaign_id: campaignId,
          status: 'PAUSED',
          billing_event: 'IMPRESSIONS',
          optimization_goal: mitPixel ? 'OFFSITE_CONVERSIONS' : 'LANDING_PAGE_VIEWS',
          destination_type: 'WEBSITE',
          ...(mitPixel ? { promoted_object: { pixel_id: agency.meta_pixel_id, custom_event_type: 'LEAD' } } : {}),
          targeting,
        },
      });
      adsetId = res.id;
      await svc.from('meta_kampagnen').update({ adset_id: adsetId, targeting, updated_at: now.toISOString() }).eq('agency_id', agencyId);
    }

    // 3. Anzeigen je freigegebener Ad
    const ads = await ladeAds(svc, agencyId, ['bereit']);
    for (const ad of ads.filter((a) => !a.meta_ad_id)) {
      try {
        const url = await dateiUrl(ad, svc, opts);
        if (!url) {
          ergebnis.uebersprungen.push({ ad_id: ad.id, grund: 'Datei nicht abrufbar – bitte als Upload in der Cloud ablegen' });
          await svc.from('ad_items').update({ meta_fehler: 'Datei nicht abrufbar – bitte als Upload in der Cloud ablegen' }).eq('id', ad.id);
          continue;
        }
        const t = texteAus(ad);
        const cta = { type: 'APPLY_NOW', value: { link: v.funnelUrl } };
        let creativeId = ad.meta_creative_id;

        if (!creativeId && ad.typ === 'grafik') {
          const bild = await metaRequest<{ images: Record<string, { hash: string }> }>(`${META_ACT(act)}/adimages`, { method: 'POST', body: { url } });
          const hash = Object.values(bild.images ?? {})[0]?.hash;
          if (!hash) throw new Error('Bild-Upload ohne Hash');
          const c = await metaRequest<{ id: string }>(`${META_ACT(act)}/adcreatives`, {
            method: 'POST',
            body: {
              name: `${ad.titel}`.slice(0, 100),
              object_story_spec: {
                page_id: agency.meta_page_id,
                link_data: { message: t.primaertext, link: v.funnelUrl, name: t.ueberschrift, description: t.beschreibung, call_to_action: cta, image_hash: hash },
              },
            },
          });
          creativeId = c.id;
        } else if (!creativeId) {
          // Video/Reel: hochladen, Vorschaubild abwarten (Meta verarbeitet Videos asynchron)
          let videoId = ad.meta_video_id;
          if (!videoId) {
            const vid = await metaRequest<{ id: string }>(`${META_ACT(act)}/advideos`, { method: 'POST', body: { file_url: url, name: ad.titel.slice(0, 100) } });
            videoId = vid.id;
            await svc.from('ad_items').update({ meta_video_id: videoId }).eq('id', ad.id);
          }
          const thumbs = await metaRequest<{ data?: Array<{ uri: string; is_preferred?: boolean }> }>(`/${videoId}/thumbnails`, { params: { fields: 'uri,is_preferred' } });
          const bild = (thumbs.data ?? []).find((x) => x.is_preferred)?.uri ?? thumbs.data?.[0]?.uri;
          if (!bild) {
            ergebnis.uebersprungen.push({ ad_id: ad.id, grund: 'Video wird bei Meta noch verarbeitet – nächster Lauf legt die Anzeige an' });
            continue;
          }
          const c = await metaRequest<{ id: string }>(`${META_ACT(act)}/adcreatives`, {
            method: 'POST',
            body: {
              name: `${ad.titel}`.slice(0, 100),
              object_story_spec: {
                page_id: agency.meta_page_id,
                video_data: { video_id: videoId, image_url: bild, message: t.primaertext, title: t.ueberschrift, link_description: t.beschreibung, call_to_action: cta },
              },
            },
          });
          creativeId = c.id;
        }
        await svc.from('ad_items').update({ meta_creative_id: creativeId, meta_fehler: null }).eq('id', ad.id);

        const anzeige = await metaRequest<{ id: string }>(`${META_ACT(act)}/ads`, {
          method: 'POST',
          body: { name: ad.titel.slice(0, 100), adset_id: adsetId, creative: { creative_id: creativeId }, status: 'PAUSED' },
        });
        await svc.from('ad_items').update({ meta_ad_id: anzeige.id, meta_fehler: null, updated_at: now.toISOString() }).eq('id', ad.id);
        ergebnis.neueAnzeigen++;
      } catch (err) {
        const msg = fehlerText(err);
        ergebnis.uebersprungen.push({ ad_id: ad.id, grund: msg });
        await svc.from('ad_items').update({ meta_fehler: msg.slice(0, 500) }).eq('id', ad.id);
      }
    }

    const { data: mitAnzeige } = await svc.from('ad_items').select('id').eq('agency_id', agencyId).not('meta_ad_id', 'is', null).limit(1);
    const hatAnzeigen = (mitAnzeige ?? []).length > 0;
    await svc
      .from('meta_kampagnen')
      .update({
        status: k.status === 'aktiv' ? 'aktiv' : 'angelegt',
        fehler: null,
        in_arbeit_seit: null,
        angelegt_am: k.angelegt_am ?? now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('agency_id', agencyId);

    if (hatAnzeigen) await hakeAb(svc, agencyId, ['s_werbemanager', 's_ads_vorbereitet'], 'Kampagne per Meta-API angelegt (pausiert)', opts.userId);
    if (ergebnis.uebersprungen.length) {
      await meldeFehler(svc, agencyId, agency.name, 'Meta: Anzeigen nicht angelegt', ergebnis.uebersprungen.map((u) => `• ${u.grund}`).join('\n'));
    }
    return { ...ergebnis, ok: true, campaign_id: campaignId, adset_id: adsetId };
  } catch (err) {
    const msg = fehlerText(err);
    await svc.from('meta_kampagnen').update({ status: 'fehler', fehler: msg.slice(0, 1000), in_arbeit_seit: null, updated_at: now.toISOString() }).eq('agency_id', agencyId);
    await meldeFehler(svc, agencyId, agency.name, 'Meta: Kampagne konnte nicht angelegt werden', msg);
    return { ...ergebnis, fehler: msg };
  }
}

/**
 * Kampagne, Anzeigengruppe und alle angelegten Anzeigen auf ACTIVE setzen – ab hier fließt Geld.
 * Nur per Knopf (userId) oder über `pruefeAutostart`.
 */
export async function aktiviereKampagne(
  svc: SupabaseClient,
  agencyId: string,
  opts: { userId?: string | null; quelle: 'knopf' | 'auto'; now?: Date },
): Promise<{ ok: boolean; fehler?: string; anzeigen: number }> {
  const now = opts.now ?? new Date();
  const k = await ladeKampagne(svc, agencyId);
  if (!k?.campaign_id || !k.adset_id) return { ok: false, fehler: 'Noch keine Kampagne angelegt', anzeigen: 0 };
  const { data } = await svc.from('ad_items').select('id, meta_ad_id, stage').eq('agency_id', agencyId).not('meta_ad_id', 'is', null);
  const ads = (data ?? []) as Array<{ id: string; meta_ad_id: string; stage: string }>;
  if (!ads.length) return { ok: false, fehler: 'Keine Anzeigen in der Kampagne', anzeigen: 0 };
  const agency = await ladeAgency(svc, agencyId);

  try {
    await metaRequest(`/${k.campaign_id}`, { method: 'POST', body: { status: 'ACTIVE' } });
    await metaRequest(`/${k.adset_id}`, { method: 'POST', body: { status: 'ACTIVE' } });
    for (const ad of ads) await metaRequest(`/${ad.meta_ad_id}`, { method: 'POST', body: { status: 'ACTIVE' } });
  } catch (err) {
    const msg = fehlerText(err);
    await svc.from('meta_kampagnen').update({ fehler: msg.slice(0, 1000), updated_at: now.toISOString() }).eq('agency_id', agencyId);
    await meldeFehler(svc, agencyId, agency.name, 'Meta: Kampagne konnte nicht gestartet werden', msg);
    return { ok: false, fehler: msg, anzeigen: 0 };
  }

  for (const ad of ads.filter((a) => a.stage !== 'live')) {
    await svc.from('ad_items').update({ stage: 'live', live_am: now.toISOString(), updated_at: now.toISOString() }).eq('id', ad.id);
  }
  await svc
    .from('meta_kampagnen')
    .update({ status: 'aktiv', fehler: null, aktiviert_am: k.aktiviert_am ?? now.toISOString(), aktiviert_von: opts.userId ?? null, updated_at: now.toISOString() })
    .eq('agency_id', agencyId);

  // „Kampagne live“ abhaken – bei zusätzlich gebuchtem Indeed bleibt der Schritt offen (Indeed startet separat)
  const mitIndeed = bausteineVon(agency.bausteine).includes('indeed');
  const quelle = opts.quelle === 'auto' ? 'automatisch nach erfolgreichem Test-Lead' : 'per Knopf';
  if (!mitIndeed) await hakeAb(svc, agencyId, ['s_launch'], `Meta-Kampagne ${quelle} gestartet`, opts.userId);

  const csm = await resolveOwner(svc, 'csm');
  if (csm) {
    await createNotification(svc, {
      user_id: csm,
      agency_id: agencyId,
      title: `Meta-Kampagne live: ${agency.name}`,
      body: `${ads.length} Anzeige(n) ${quelle} gestartet${mitIndeed ? ' – Indeed separat starten, dann „Kampagne live“ abhaken.' : '.'}`,
      type: 'system',
      entity_type: 'agency',
      entity_id: agencyId,
      push_url: `/clients/${agencyId}/ablauf`,
    }).catch(() => {});
  }
  return { ok: true, anzeigen: ads.length };
}

/** Autostart nur mit Einstellung `kampagne_autostart` UND erfolgreich durchgespieltem Test-Lead */
export async function pruefeAutostart(svc: SupabaseClient, agencyId: string, now: Date = new Date()): Promise<boolean> {
  const agency = await ladeAgency(svc, agencyId);
  if ((agency.settings ?? {}).kampagne_autostart !== true) return false;
  const k = await ladeKampagne(svc, agencyId);
  if (!k?.campaign_id || k.status !== 'angelegt') return false;
  const { data: testlead } = await svc.from('client_steps').select('status').eq('agency_id', agencyId).eq('step_key', 's_testlead').maybeSingle();
  if ((testlead as { status: string } | null)?.status !== 'erledigt') return false;
  const r = await aktiviereKampagne(svc, agencyId, { quelle: 'auto', now });
  return r.ok;
}

/**
 * Periodischer Lauf: Kunden in der Setup-Phase mit Meta-Baustein – Kampagne anlegen/vervollständigen,
 * sobald alle Voraussetzungen erfüllt sind, danach ggf. Autostart. Fehler eines Kunden stoppen den Lauf nicht.
 */
export async function metaKampagnenLauf(svc: SupabaseClient, opts: KampagneDeps & { maxKunden?: number } = {}) {
  if (!process.env.META_SYSTEM_USER_TOKEN) return { angelegt: 0, gestartet: 0, fehler: 0 };
  // Nur Automatik-Kunden (neue Fulfillment-Strecke); per Knopf geht es bei jedem Kunden
  const { data } = await svc.from('agencies').select('id, bausteine').eq('fulfillment_phase', 'setup').eq('automatik', true);
  const kunden = ((data ?? []) as Array<{ id: string; bausteine: unknown }>).filter((a) => bausteineVon(a.bausteine).includes('meta')).slice(0, opts.maxKunden ?? 5);
  let angelegt = 0;
  let gestartet = 0;
  let fehler = 0;
  for (const kunde of kunden) {
    try {
      const k = await ladeKampagne(svc, kunde.id);
      if (k?.status === 'fehler') continue; // Fehler klärt ein Mensch, dann per Knopf erneut
      const offen = (await ladeAds(svc, kunde.id, ['bereit'])).some((a) => !a.meta_ad_id);
      if (!k?.campaign_id || !k.adset_id || offen) {
        const r = await legeKampagneAn(svc, kunde.id, opts);
        if (r.ok && r.neueAnzeigen) angelegt++;
      }
      if (await pruefeAutostart(svc, kunde.id, opts.now)) gestartet++;
    } catch (err) {
      fehler++;
      console.error('[meta-kampagne] Lauf fehlgeschlagen', kunde.id, err);
    }
  }
  return { angelegt, gestartet, fehler };
}

export { ladeKampagne };
