/**
 * Kunden-Freigabelink (wie Frame.io-Review-Link): Der Kunde sieht ohne Login die aktuelle Version,
 * kommentiert zeitgenau mit seinem Namen und gibt frei oder fordert Änderungen an.
 * Interne Kommentare sieht er nicht. Bearbeiter + Prüfer werden benachrichtigt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { meldeVideo } from './ablauf';
import { VIDEO_BUCKET } from './konstanten';

export const KUNDEN_STATUS = { offen: 'Wartet auf Kunde', freigegeben: 'Kunde hat freigegeben', aenderungen: 'Kunde wünscht Änderungen' } as const;
export type KundenStatus = keyof typeof KUNDEN_STATUS;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function freigabeUrl(token: string): string {
  return `${process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de'}/freigabe/${token}`;
}

export interface FreigabeDaten {
  token: string;
  video: { id: string; titel: string; kunde: string | null; kunden_status: KundenStatus | null; version: number };
  versionId: string;
  url: string | null;
  dauer_s: number | null;
  kommentare: Array<{ id: string; zeit_s: number | null; zeit_bis_s: number | null; text: string; kunde_name: string | null; erledigt: boolean; created_at: string }>;
}

/** Aktiven Link prüfen – null bei unbekanntem, deaktiviertem oder abgelaufenem Link */
export async function ladeLink(svc: SupabaseClient, token: string): Promise<{ video_id: string } | null> {
  if (!UUID.test(token)) return null;
  const { data } = await svc.from('video_freigabe_links').select('video_id, aktiv, gueltig_bis').eq('token', token).maybeSingle();
  const l = data as { video_id: string; aktiv: boolean; gueltig_bis: string | null } | null;
  if (!l || !l.aktiv || (l.gueltig_bis && new Date(l.gueltig_bis).getTime() < Date.now())) return null;
  return { video_id: l.video_id };
}

export async function ladeFreigabe(svc: SupabaseClient, token: string): Promise<FreigabeDaten | null> {
  const link = await ladeLink(svc, token);
  if (!link) return null;
  const { data: v } = await svc.from('videos').select('id, titel, aktuelle_version, kunden_status, agencies(name)').eq('id', link.video_id).maybeSingle();
  const video = v as { id: string; titel: string; aktuelle_version: number; kunden_status: KundenStatus | null; agencies: { name: string } | null } | null;
  if (!video) return null;
  const { data: ver } = await svc.from('video_versionen').select('id, storage_pfad, dauer_s').eq('video_id', video.id).eq('version', video.aktuelle_version).maybeSingle();
  const version = ver as { id: string; storage_pfad: string; dauer_s: number | null } | null;
  if (!version) return null;
  const [{ data: signiert }, { data: k }] = await Promise.all([
    svc.storage.from(VIDEO_BUCKET).createSignedUrl(version.storage_pfad, 4 * 3600),
    svc
      .from('video_kommentare')
      .select('id, zeit_s, zeit_bis_s, text, kunde_name, erledigt, created_at')
      .eq('video_id', video.id)
      .eq('version_id', version.id)
      .eq('extern', true)
      .order('zeit_s', { ascending: true, nullsFirst: true })
      .order('created_at'),
  ]);
  return {
    token,
    video: { id: video.id, titel: video.titel, kunde: video.agencies?.name ?? null, kunden_status: video.kunden_status, version: video.aktuelle_version },
    versionId: version.id,
    url: signiert?.signedUrl ?? null,
    dauer_s: version.dauer_s,
    kommentare: (k ?? []) as FreigabeDaten['kommentare'],
  };
}

/** Bearbeiter + Prüfer informieren */
export async function meldeKundenAktion(svc: SupabaseClient, videoId: string, titel: string, body: string): Promise<void> {
  const { data } = await svc.from('videos').select('bearbeiter_id, pruefer_id').eq('id', videoId).maybeSingle();
  const v = data as { bearbeiter_id: string | null; pruefer_id: string | null } | null;
  for (const an of new Set([v?.bearbeiter_id, v?.pruefer_id].filter((x): x is string => !!x))) {
    await meldeVideo(svc, an, null, videoId, titel, body);
  }
}
