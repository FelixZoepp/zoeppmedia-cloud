/**
 * Ads-Ablauf: Idee → Material → Bearbeitung → Freigabe Kunde → Bereit → Live (oder Verworfen).
 *
 * - Material: Grafik wird gebaut bzw. Video-Rohmaterial kommt vom Kunden
 * - Bearbeitung: Nils schneidet/baut
 * - Freigabe Kunde: Kunde sieht die Ad unter "Deine Aufgaben" und gibt frei oder wünscht Änderungen
 * - Bereit: freigegeben, kann live geschaltet werden
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createNotification, createNotificationForAgency } from '@/lib/notifications/create';
import { isSignalSatisfied, signalSafe } from '@/lib/fulfillment/engine';

import { AD_ASSET_BUCKET, type AdStage, type AdItem } from './constants';

export * from './constants';

/** Stage ändern, Verlauf schreiben, Beteiligte benachrichtigen. */
export async function moveAd(
  svc: SupabaseClient,
  adId: string,
  stage: AdStage,
  opts: { userId?: string | null; kommentar?: string | null; vonKunde?: boolean; now?: Date } = {},
): Promise<AdItem> {
  const now = (opts.now ?? new Date()).toISOString();
  const { data } = await svc.from('ad_items').select('*').eq('id', adId).maybeSingle();
  const ad = data as AdItem | null;
  if (!ad) throw new Error('Ad nicht gefunden');

  const patch: Record<string, unknown> = { stage, updated_at: now };
  if (stage === 'bereit' && opts.vonKunde) patch.freigegeben_am = now;
  if (stage === 'live') patch.live_am = now;
  if (opts.vonKunde && stage === 'bearbeitung') patch.kunden_kommentar = opts.kommentar ?? null;
  if (stage === 'freigabe_kunde') patch.kunden_kommentar = null;

  await svc.from('ad_items').update(patch).eq('id', adId);
  await svc.from('ad_item_log').insert({
    ad_item_id: adId,
    von_stage: ad.stage,
    nach_stage: stage,
    kommentar: opts.kommentar ?? null,
    user_id: opts.userId ?? null,
  });

  // Benachrichtigungen
  if (stage === 'freigabe_kunde') {
    await createNotificationForAgency(svc, ad.agency_id, {
      title: 'Neue Ad zur Freigabe',
      body: `"${ad.titel}" wartet auf deine Freigabe.`,
      type: 'task_assigned',
      push_url: '/deine-aufgaben',
    }).catch(() => {});
  }
  if (opts.vonKunde && ad.assignee_id) {
    const { data: ag } = await svc.from('agencies').select('name').eq('id', ad.agency_id).maybeSingle();
    const kunde = (ag as { name: string } | null)?.name ?? 'Kunde';
    await createNotification(svc, {
      user_id: ad.assignee_id,
      agency_id: ad.agency_id,
      title: stage === 'bereit' ? `${kunde} hat freigegeben – Ad kann live` : `${kunde} wünscht Änderungen`,
      body: stage === 'bereit' ? `"${ad.titel}"` : `"${ad.titel}": ${opts.kommentar ?? ''}`.slice(0, 200),
      type: 'task_assigned',
      push_url: '/ads',
    }).catch(() => {});
  }

  return { ...ad, ...patch } as AdItem;
}

/** Kunde gibt frei oder wünscht Änderungen. Nur Ads seiner Agentur in "Freigabe Kunde". */
export async function customerDecision(
  svc: SupabaseClient,
  agencyId: string,
  adId: string,
  aktion: 'freigeben' | 'aendern',
  userId: string,
  kommentar?: string | null,
): Promise<AdItem> {
  const { data } = await svc.from('ad_items').select('agency_id, stage').eq('id', adId).maybeSingle();
  const ad = data as { agency_id: string; stage: AdStage } | null;
  if (!ad || ad.agency_id !== agencyId) throw new Error('Ad nicht gefunden');
  if (ad.stage !== 'freigabe_kunde') throw new Error('Diese Ad wartet gerade nicht auf deine Freigabe');
  if (aktion === 'aendern' && !kommentar?.trim()) throw new Error('Bitte kurz beschreiben, was geändert werden soll');

  const ergebnis = await moveAd(svc, adId, aktion === 'freigeben' ? 'bereit' : 'bearbeitung', {
    userId,
    kommentar: kommentar?.trim() || null,
    vonKunde: true,
  });
  // Letzte offene Freigabe erteilt → Fulfillment-Schritt „Ads & Texte freigegeben“ abhaken
  if (aktion === 'freigeben' && (await isSignalSatisfied(svc, agencyId, 'ads_freigegeben').catch(() => false))) {
    await signalSafe(svc, agencyId, 'ads_freigegeben');
  }
  return ergebnis;
}

/** Signierte Vorschau-URL für hochgeladene Dateien (1 Stunde gültig). */
export async function withPreviewUrls<T extends { asset_path: string | null; asset_url: string | null }>(
  svc: SupabaseClient,
  ads: T[],
): Promise<Array<T & { vorschau_url: string | null }>> {
  return Promise.all(
    ads.map(async (a) => {
      if (!a.asset_path) return { ...a, vorschau_url: a.asset_url };
      const { data } = await svc.storage.from(AD_ASSET_BUCKET).createSignedUrl(a.asset_path, 3600);
      return { ...a, vorschau_url: data?.signedUrl ?? a.asset_url };
    }),
  );
}
