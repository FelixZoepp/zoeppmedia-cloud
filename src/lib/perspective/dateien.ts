/**
 * Funnel-Uploads (z. B. „Lade ein Bild von dir hoch“) in die Cloud übernehmen: Perspective liefert nur einen
 * Download-Link (läuft ab). Die Datei wird geladen, im Bucket candidate-resumes gespeichert, als Dokument
 * der Bewerbung angelegt und in vorquali_json durch „datei:<dokument-id>“ ersetzt – die Bewerberakte zeigt
 * daraus das Bild bzw. einen Link zur Datei. Läuft als Job (bewerber.funnel_dateien), damit der Webhook schnell bleibt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export const DATEI_PREFIX = 'datei:';
const MAX_BYTES = 15 * 1024 * 1024;
const ERLAUBT = /^(image\/(jpeg|png|webp|gif|heic|heif)|application\/pdf)$/;

/** Sieht die Antwort wie ein Datei-Link aus? (rein, testbar) */
export function istDateiLink(wert: unknown): wert is string {
  if (typeof wert !== 'string' || !/^https:\/\//i.test(wert.trim())) return false;
  try {
    const u = new URL(wert.trim());
    if (/leadnotifications\.co$/i.test(u.hostname) && u.pathname.includes('/download/')) return true;
    const name = u.searchParams.get('filename') ?? u.pathname;
    return /\.(jpe?g|png|webp|gif|heic|heif|pdf)$/i.test(name);
  } catch {
    return false;
  }
}

/** Dateiendung zum MIME-Typ (rein, testbar) */
export function endungFuer(mime: string): string {
  if (mime === 'application/pdf') return 'pdf';
  if (mime === 'image/jpeg') return 'jpg';
  return mime.split('/')[1] ?? 'bin';
}

export async function planeFunnelDateien(svc: SupabaseClient, agencyId: string, candidateId: string, angaben: Record<string, string> | null | undefined): Promise<void> {
  if (!angaben || !Object.values(angaben).some(istDateiLink)) return;
  await svc.from('scheduled_jobs').insert({
    agency_id: agencyId,
    type: 'bewerber.funnel_dateien',
    run_at: new Date().toISOString(),
    payload: { candidate_id: candidateId },
    status: 'pending',
    dedupe_key: `bewerber.funnel_dateien:${candidateId}`,
  });
}

/** Job: alle Datei-Links eines Bewerbers übernehmen. Gibt die Zahl der übernommenen Dateien zurück. */
export async function uebernehmeFunnelDateien(svc: SupabaseClient, payload: { candidate_id: string }): Promise<number> {
  const { data: c } = await svc.from('candidates').select('id, agency_id, vorquali_json').eq('id', payload.candidate_id).maybeSingle();
  const cand = c as { id: string; agency_id: string; vorquali_json: Record<string, unknown> | null } | null;
  if (!cand?.vorquali_json) return 0;
  const { data: app } = await svc.from('applications').select('id').eq('candidate_id', cand.id).eq('agency_id', cand.agency_id).order('created_at').limit(1).maybeSingle();
  const appId = (app as { id: string } | null)?.id;
  if (!appId) return 0;

  const neu = { ...cand.vorquali_json };
  let n = 0;
  for (const [frage, wert] of Object.entries(cand.vorquali_json)) {
    if (!istDateiLink(wert)) continue;
    try {
      const res = await fetch(wert, { signal: AbortSignal.timeout(20_000) });
      if (!res.ok) continue;
      const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
      if (!ERLAUBT.test(mime)) continue;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.length === 0 || buf.length > MAX_BYTES) continue;
      const pfad = `${cand.agency_id}/${cand.id}/funnel-${Date.now()}-${n}.${endungFuer(mime)}`;
      const { error: upErr } = await svc.storage.from('candidate-resumes').upload(pfad, buf, { contentType: mime });
      if (upErr) continue;
      const { data: doc, error: docErr } = await svc
        .from('documents')
        .insert({ agency_id: cand.agency_id, application_id: appId, storage_path: pfad, mime, size: buf.length, origin: 'funnel' })
        .select('id')
        .single();
      if (docErr || !doc) continue;
      neu[frage] = `${DATEI_PREFIX}${(doc as { id: string }).id}`;
      n++;
    } catch (err) {
      console.error('[funnel-dateien] Datei nicht übernommen', cand.id, err);
    }
  }
  if (n) await svc.from('candidates').update({ vorquali_json: neu }).eq('id', cand.id);
  return n;
}
