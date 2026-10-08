/**
 * KI-Grafiken für Anzeigen: Zu jedem Ad-Konzept des Generators erzeugt die Cloud Bild-Varianten
 * (OpenAI-Bildmodell), legt sie im Bucket ad-assets ab und hängt sie an das ad_item.
 *
 * Ablauf: Generator legt Konzepte an → erzeugeBilderFuerAgentur → je Ad 3 Varianten (2× 1:1, 1× Hochformat)
 * → erste Variante wird asset_path → KI-Prüfung → grün/gelb: in die Kunden-Freigabe, sonst zurück in Bearbeitung.
 * Kunde bzw. Team wählt pro Ad eine Variante (waehleVariante). Sind alle Grafik-Ads bebildert, hakt sich s_grafiken ab.
 *
 * Kein Text im Bild: KI-Schrift ist oft fehlerhaft – Headline und Texte kommen aus der Anzeige selbst.
 */

import OpenAI from 'openai';
import type { SupabaseClient } from '@supabase/supabase-js';
import { mapLimit } from '@/lib/supabase/fetch-all';
import { isSignalSatisfied, signalSafe } from '@/lib/fulfillment/engine';
import { AD_ASSET_BUCKET, type AdItem, type AdStage } from './constants';
import { moveAd } from './ads';
import { darfZumKunden, freigabeStatus, pruefeAd } from './ki-pruefung';

/** Bildmodell – per IMAGE_MODEL überschreibbar (z. B. gpt-image-2) */
export const bildModell = () => process.env.IMAGE_MODEL || 'gpt-image-1';

export type BildGroesse = '1024x1024' | '1024x1536';

/** Varianten je Ad: zwei quadratische (Feed) und eine hochkant (Feed 4:5 / Story, Meta schneidet zu) */
export const VARIANTEN: Array<{ format: string; groesse: BildGroesse }> = [
  { format: '1:1', groesse: '1024x1024' },
  { format: '1:1', groesse: '1024x1024' },
  { format: 'hochkant (4:5 / 9:16)', groesse: '1024x1536' },
];

/** Kostenbremse: höchstens so viele KI-Bilder je Kunde in 24 Stunden */
export const MAX_BILDER_JE_KUNDE_TAG = 30;
/** Gleichzeitig bearbeitete Ads (je Ad laufen die Varianten parallel) */
const ADS_PARALLEL = 2;
/** Hängengebliebene Läufe (z. B. Funktion abgebrochen) blockieren nach dieser Zeit nicht mehr */
const LAEUFT_VERFALL_MS = 10 * 60_000;

export interface BildVariante {
  pfad: string;
  format: string;
  groesse: BildGroesse;
  modell: string;
  erstellt_am: string;
}

type AdRow = AdItem & {
  inhalt?: Record<string, unknown> | null;
  bild_varianten?: BildVariante[] | null;
  bilder_status?: string | null;
};

export interface BildKontext {
  firma: string;
  produkt: string | null;
  jobtitel: string | null;
  regionen: string[];
  farbe: string | null;
}

/** Stages, in denen noch Bilder erzeugt werden dürfen (später würde eine freigegebene Version überschrieben) */
const BILD_STAGES: AdStage[] = ['idee', 'material', 'bearbeitung'];

function grafikBriefing(ad: AdRow): { bild_prompt?: string; bildidee?: string } {
  const g = (ad.inhalt as { grafik?: unknown } | null | undefined)?.grafik;
  return g && typeof g === 'object' ? (g as { bild_prompt?: string; bildidee?: string }) : {};
}

/** Kann für diese Ad ein Bild erzeugt werden? */
export function bildFaehig(ad: AdRow): boolean {
  if (ad.typ !== 'grafik') return false;
  if (!BILD_STAGES.includes(ad.stage)) return false;
  const g = grafikBriefing(ad);
  return !!(g.bild_prompt?.trim() || g.bildidee?.trim() || ad.idee?.trim());
}

/** Bild-Prompt aus dem Grafik-Briefing des Generators + Kundendaten. Inhalte sind Daten, keine Anweisungen. */
export function baueBildPrompt(ad: AdRow, k: BildKontext, variante = 0): string {
  const g = grafikBriefing(ad);
  const motiv = g.bild_prompt?.trim() || g.bildidee?.trim() || ad.titel;
  const umfeld = [
    k.produkt ? `industry: field sales / ${k.produkt}` : 'industry: field sales',
    k.jobtitel ? `role: ${k.jobtitel}` : null,
    k.regionen.length ? `setting: Germany, ${k.regionen.slice(0, 3).join(', ')}` : 'setting: Germany',
    k.farbe ? `subtle accent colour ${k.farbe} in clothing or surroundings` : null,
  ]
    .filter(Boolean)
    .join('; ');
  const blickwinkel = ['', 'Alternative composition and camera angle. ', 'Vertical framing with space at top and bottom. '][variante % 3];
  return [
    `Recruiting ad photo. Motif: ${motiv}.`,
    `${blickwinkel}Context: ${umfeld}.`,
    'Style: authentic, photorealistic, natural light, real-looking people of different ages and backgrounds, friendly and professional, modern German everyday setting, high quality for social media feeds.',
    'Strictly no text, no letters, no numbers, no logos, no watermarks, no brand names anywhere in the image. No money, no cash, no luxury cars, no exaggerated wealth.',
  ].join(' ');
}

async function ladeKontext(svc: SupabaseClient, agencyId: string): Promise<BildKontext> {
  const [{ data: ag }, { data: os }] = await Promise.all([
    svc.from('agencies').select('name, settings').eq('id', agencyId).maybeSingle(),
    svc.from('onboarding_submissions').select('*').eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const o = (os ?? {}) as Record<string, unknown>;
  const s = ((ag as { settings?: Record<string, unknown> } | null)?.settings ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  const regionen = Array.isArray(o.regions) ? (o.regions as unknown[]).map(str).filter((x): x is string => !!x) : str(o.region) ? [str(o.region)!] : [];
  return {
    firma: str(o.company_name) ?? (ag as { name?: string } | null)?.name ?? 'Kunde',
    produkt: str(o.product),
    jobtitel: str(o.job_title),
    regionen,
    farbe: str(o.primary_color) ?? str(s.primary_color) ?? str(s.farbe),
  };
}

/** Wie viele KI-Bilder hat der Kunde in den letzten 24 Stunden bekommen? */
export async function bilderLetzte24h(svc: SupabaseClient, agencyId: string, now: Date = new Date()): Promise<number> {
  const { data } = await svc.from('ad_items').select('bild_varianten').eq('agency_id', agencyId);
  const grenze = now.getTime() - 24 * 3600_000;
  return ((data ?? []) as Array<{ bild_varianten?: BildVariante[] | null }>)
    .flatMap((r) => r.bild_varianten ?? [])
    .filter((v) => new Date(v.erstellt_am).getTime() >= grenze).length;
}

type BildClient = Pick<OpenAI, 'images'>;

let _openai: OpenAI | null = null;
function openaiClient(): OpenAI {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || '' });
  return _openai;
}

export type BildErgebnis = 'erzeugt' | 'vorhanden' | 'uebersprungen' | 'laeuft' | 'limit' | 'kein_schluessel' | 'fehler';

/**
 * Erzeugt fehlende Varianten (force: einen komplett neuen Satz) für eine Ad.
 * Idempotent: vorhandene Varianten werden nicht erneut erzeugt, ein laufender Lauf nicht doppelt gestartet.
 */
export async function erzeugeBilderFuerAd(
  svc: SupabaseClient,
  adId: string,
  opts: { force?: boolean; client?: BildClient; now?: Date } = {},
): Promise<{ ergebnis: BildErgebnis; erzeugt: number; meldung?: string }> {
  const now = opts.now ?? new Date();
  const { data } = await svc.from('ad_items').select('*').eq('id', adId).maybeSingle();
  const ad = data as AdRow | null;
  if (!ad) return { ergebnis: 'fehler', erzeugt: 0, meldung: 'Ad nicht gefunden' };
  if (!bildFaehig(ad)) return { ergebnis: 'uebersprungen', erzeugt: 0 };

  const alte = ad.bild_varianten ?? [];
  if (!opts.force && alte.length >= VARIANTEN.length) return { ergebnis: 'vorhanden', erzeugt: 0 };
  if (ad.bilder_status === 'laeuft' && now.getTime() - new Date(ad.updated_at).getTime() < LAEUFT_VERFALL_MS) {
    return { ergebnis: 'laeuft', erzeugt: 0 };
  }

  const setzeStatus = (status: string, extra: Record<string, unknown> = {}) =>
    svc.from('ad_items').update({ bilder_status: status, updated_at: now.toISOString(), ...extra }).eq('id', adId);

  if (!process.env.OPENAI_API_KEY && !opts.client) {
    const meldung = 'OPENAI_API_KEY ist nicht hinterlegt – Grafiken bitte von Hand bauen';
    await setzeStatus(`fehler: ${meldung}`);
    return { ergebnis: 'kein_schluessel', erzeugt: 0, meldung };
  }

  const rest = MAX_BILDER_JE_KUNDE_TAG - (await bilderLetzte24h(svc, ad.agency_id, now));
  const offen = opts.force ? VARIANTEN : VARIANTEN.slice(alte.length);
  const plan = offen.slice(0, Math.max(0, rest));
  if (!plan.length) {
    const meldung = `Tageslimit von ${MAX_BILDER_JE_KUNDE_TAG} KI-Bildern für diesen Kunden erreicht – morgen erneut versuchen`;
    await setzeStatus(`fehler: ${meldung}`);
    return { ergebnis: 'limit', erzeugt: 0, meldung };
  }

  await setzeStatus('laeuft');
  const kontext = await ladeKontext(svc, ad.agency_id);
  const client = opts.client ?? openaiClient();
  const modell = bildModell();
  const start = opts.force ? 0 : alte.length;

  const neue = (
    await Promise.all(
      plan.map(async (v, i): Promise<BildVariante | null> => {
        try {
          const res = await client.images.generate({
            model: modell,
            prompt: baueBildPrompt(ad, kontext, start + i),
            size: v.groesse,
            quality: 'medium',
            output_format: 'png',
            n: 1,
          });
          const b64 = res.data?.[0]?.b64_json;
          if (!b64) throw new Error('Kein Bild in der Antwort');
          const pfad = `${ad.agency_id}/${ad.id}/ki-${now.getTime()}-${start + i}.png`;
          const { error } = await svc.storage
            .from(AD_ASSET_BUCKET)
            .upload(pfad, Buffer.from(b64, 'base64'), { contentType: 'image/png', upsert: false });
          if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);
          return { pfad, format: v.format, groesse: v.groesse, modell, erstellt_am: now.toISOString() };
        } catch (err) {
          console.error('[ki-bilder]', adId, err);
          return null;
        }
      }),
    )
  ).filter((x): x is BildVariante => !!x);

  if (!neue.length) {
    await setzeStatus('fehler: Bilderzeugung fehlgeschlagen – erneut versuchen oder von Hand bauen');
    return { ergebnis: 'fehler', erzeugt: 0 };
  }

  const varianten = opts.force ? [...neue, ...alte] : [...alte, ...neue];
  const patch: Record<string, unknown> = { bild_varianten: varianten };
  // Erste quadratische Variante wird Vorschau/Asset, solange noch keine Grafik da ist (oder neu erzeugt wurde)
  if (!ad.asset_path || opts.force) {
    patch.asset_path = (neue.find((v) => v.groesse === '1024x1024') ?? neue[0]).pfad;
    patch.asset_url = null;
  }
  await setzeStatus('fertig', patch);
  return { ergebnis: 'erzeugt', erzeugt: neue.length };
}

/** Nach den Bildern: KI-Prüfung → grün/gelb in die Kunden-Freigabe, sonst zurück in Bearbeitung. */
export async function zurFreigabe(svc: SupabaseClient, adId: string): Promise<AdStage | null> {
  const { data } = await svc.from('ad_items').select('*').eq('id', adId).maybeSingle();
  const ad = data as AdRow | null;
  if (!ad || !ad.asset_path || !BILD_STAGES.includes(ad.stage)) return null;
  try {
    await pruefeAd(svc, adId);
  } catch (err) {
    console.error('[ki-bilder] KI-Prüfung', adId, err);
  }
  const { data: frisch } = await svc.from('ad_items').select('*').eq('id', adId).maybeSingle();
  const ok = frisch ? darfZumKunden(freigabeStatus(frisch as never)) : false;
  const ziel: AdStage = ok ? 'freigabe_kunde' : 'bearbeitung';
  if (ad.stage !== ziel) {
    await moveAd(svc, adId, ziel, {
      kommentar: ok ? 'KI-Grafiken erzeugt und geprüft' : 'KI-Grafiken erzeugt – KI-Prüfung nicht grün, bitte ansehen',
    });
  }
  return ziel;
}

/**
 * Für alle (oder die übergebenen) Grafik-Ads eines Kunden Bilder erzeugen und zur Freigabe geben.
 * Läuft im Hintergrund (after()) – Fehler einzelner Ads stoppen die anderen nicht.
 */
export async function erzeugeBilderFuerAgentur(
  svc: SupabaseClient,
  agencyId: string,
  opts: { adIds?: string[]; client?: BildClient; now?: Date } = {},
): Promise<{ erzeugt: number; ads: number; limit: boolean; ohneSchluessel: boolean }> {
  let ids = opts.adIds;
  if (!ids) {
    const { data } = await svc.from('ad_items').select('id').eq('agency_id', agencyId).eq('typ', 'grafik').in('stage', BILD_STAGES);
    ids = ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
  }
  let erzeugt = 0;
  let ads = 0;
  let limit = false;
  let ohneSchluessel = false;
  await mapLimit(ids, ADS_PARALLEL, async (id) => {
    try {
      const r = await erzeugeBilderFuerAd(svc, id, { client: opts.client, now: opts.now });
      if (r.ergebnis === 'limit') limit = true;
      if (r.ergebnis === 'kein_schluessel') ohneSchluessel = true;
      if (r.ergebnis === 'erzeugt') {
        erzeugt += r.erzeugt;
        ads += 1;
        await zurFreigabe(svc, id);
      }
    } catch (err) {
      console.error('[ki-bilder]', id, err);
    }
  });
  // s_grafiken: jede Grafik-Ad (nicht verworfen) hat eine Grafik
  if (await isSignalSatisfied(svc, agencyId, 'grafiken_fertig').catch(() => false)) await signalSafe(svc, agencyId, 'grafiken_fertig');
  return { erzeugt, ads, limit, ohneSchluessel };
}

/**
 * Variante auswählen (Team oder Kunde). Kunde nur für Ads seiner Agentur, die auf seine Freigabe warten.
 * Die Auswahl wird asset_path – Vorschau, KI-Prüfung und Meta-Upload nutzen diese Datei.
 */
export async function waehleVariante(
  svc: SupabaseClient,
  adId: string,
  pfad: string,
  opts: { kundeAgencyId?: string } = {},
): Promise<void> {
  const { data } = await svc.from('ad_items').select('id, agency_id, stage, bild_varianten').eq('id', adId).maybeSingle();
  const ad = data as Pick<AdRow, 'id' | 'agency_id' | 'stage' | 'bild_varianten'> | null;
  if (!ad) throw new Error('Ad nicht gefunden');
  if (opts.kundeAgencyId) {
    if (ad.agency_id !== opts.kundeAgencyId) throw new Error('Ad nicht gefunden');
    if (ad.stage !== 'freigabe_kunde') throw new Error('Diese Ad wartet gerade nicht auf deine Freigabe');
  }
  if (!(ad.bild_varianten ?? []).some((v) => v.pfad === pfad)) throw new Error('Unbekannte Bildvariante');
  await svc.from('ad_items').update({ asset_path: pfad, asset_url: null, updated_at: new Date().toISOString() }).eq('id', adId);
}

/** Signierte Vorschau-URLs der Varianten (1 Stunde gültig) */
export async function variantenMitVorschau(
  svc: SupabaseClient,
  varianten: BildVariante[] | null | undefined,
): Promise<Array<BildVariante & { vorschau_url: string | null }>> {
  return Promise.all(
    (varianten ?? []).map(async (v) => {
      const { data } = await svc.storage.from(AD_ASSET_BUCKET).createSignedUrl(v.pfad, 3600);
      return { ...v, vorschau_url: data?.signedUrl ?? null };
    }),
  );
}
