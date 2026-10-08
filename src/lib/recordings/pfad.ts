import type { SupabaseClient } from '@supabase/supabase-js';

export const AUFNAHME_BUCKET = 'call-recordings';

/**
 * Storage-Pfad einer Gesprächsaufnahme.
 * Neu gespeichert wird nur der Pfad; ältere Zeilen enthalten eine (abgelaufene) Signed URL
 * der Form https://x.supabase.co/storage/v1/object/sign/call-recordings/<pfad>?token=…
 */
export function aufnahmePfad(fileUrl: string | null | undefined): string | null {
  if (!fileUrl) return null;
  if (!/^https?:\/\//.test(fileUrl)) return fileUrl;
  try {
    const marker = `/${AUFNAHME_BUCKET}/`;
    const idx = fileUrl.indexOf(marker);
    if (idx === -1) return null;
    const withQuery = fileUrl.slice(idx + marker.length);
    const qIdx = withQuery.indexOf('?');
    const raw = qIdx === -1 ? withQuery : withQuery.slice(0, qIdx);
    return decodeURIComponent(raw) || null;
  } catch {
    return null;
  }
}

/** Ersetzt file_url durch eine frische, eine Stunde gültige Signed URL. */
export async function mitFrischenAufnahmeLinks<T extends { file_url: string | null }>(
  admin: SupabaseClient,
  rows: T[],
): Promise<T[]> {
  const pfade = rows.map((r) => aufnahmePfad(r.file_url));
  const gueltig = pfade.filter((p): p is string => !!p);
  if (gueltig.length === 0) return rows;
  const { data } = await admin.storage.from(AUFNAHME_BUCKET).createSignedUrls(gueltig, 3600);
  const links = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return rows.map((r, i) => {
    const pfad = pfade[i];
    return pfad ? { ...r, file_url: links.get(pfad) ?? '' } : r;
  });
}
