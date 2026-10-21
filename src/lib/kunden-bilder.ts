/**
 * Bilder vom Kunden fürs Fulfillment: Fotos von sich (am wichtigsten), Team, Arbeitsalltag, Logo.
 * Privat im Bucket kunden-bilder unter <agency_id>/<zeit>-<zufall>.<endung>, eingetragen in kunden_bilder.
 * Nach dem Upload plant die Cloud eine gebündelte Slack-Meldung (5 Minuten Sammelzeit) – nur intern,
 * nur wenn unter /admin/freigaben „kunden_bilder_slack“ eingeschaltet ist.
 */

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { istFreigegeben } from '@/lib/freigaben';
import { slackKanal } from '@/lib/slack/kanaele';
import { KATEGORIEN, type BildKategorie } from './kunden-bilder-kategorien';

export const BILDER_BUCKET = 'kunden-bilder';
export const MAX_BILD_GROESSE = 15 * 1024 * 1024;
export const MAX_BILDER_PRO_UPLOAD = 30;

export { KATEGORIEN, istKategorie, type BildKategorie } from './kunden-bilder-kategorien';

const ENDUNG: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/svg+xml': 'svg',
};

/** Dateityp und Größe prüfen (rein, testbar). null = in Ordnung, sonst Fehlertext */
export function pruefeBild(mime: unknown, groesse: unknown): string | null {
  if (typeof mime !== 'string' || !ENDUNG[mime]) return 'Bitte als JPG, PNG, WEBP oder HEIC hochladen';
  if (typeof groesse !== 'number' || groesse <= 0) return 'Die Datei ist leer';
  if (groesse > MAX_BILD_GROESSE) return 'Das Bild ist zu groß (max. 15 MB)';
  return null;
}

/** Speicherpfad für ein neues Bild (rein bis auf Zufall) */
export function bildPfad(agencyId: string, mime: string, jetzt: Date = new Date()): string {
  return `${agencyId}/${jetzt.getTime()}-${randomUUID().slice(0, 8)}.${ENDUNG[mime] ?? 'jpg'}`;
}

/** Gehört der Pfad zu diesem Kunden? (rein, testbar) */
export function istEigenerBildPfad(pfad: unknown, agencyId: string): pfad is string {
  return typeof pfad === 'string' && new RegExp(`^${agencyId}/\\d+-[0-9a-f]{8}\\.(jpg|png|webp|heic|heif|svg)$`).test(pfad);
}

export function bildName(name: unknown): string | null {
  const n = typeof name === 'string' ? name.split(/[\\/]/).pop()!.trim() : '';
  return n ? n.slice(0, 120) : null;
}

/** Slack-Text für einen Upload-Schub (rein, testbar) */
export function bilderSlackText(kunde: string, anzahl: Partial<Record<BildKategorie, number>>, link: string): string {
  const gesamt = Object.values(anzahl).reduce((s, n) => s + (n ?? 0), 0);
  const teile = (Object.keys(KATEGORIEN) as BildKategorie[]).filter((k) => anzahl[k]).map((k) => `${anzahl[k]}× ${KATEGORIEN[k].titel}`);
  const ohneIch = !anzahl.ich ? '\n⚠️ Noch keine Fotos vom Kunden selbst dabei.' : '';
  return `🖼️ *${kunde}* hat ${gesamt === 1 ? 'ein Bild' : `${gesamt} Bilder`} hochgeladen: ${teile.join(', ')}${ohneIch}\n<${link}|Bilder ansehen>`;
}

/** Nach einem Upload: gebündelte Meldung in 5 Minuten einplanen (ein Job je Kunde und Sammelfenster) */
export async function planeBilderMeldung(svc: SupabaseClient, agencyId: string, jetzt: Date = new Date()): Promise<void> {
  const fenster = Math.floor(jetzt.getTime() / (5 * 60_000));
  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: agencyId,
    type: 'fulfillment.bilder_slack',
    run_at: new Date((fenster + 1) * 5 * 60_000).toISOString(),
    payload: { agency_id: agencyId },
    status: 'pending',
    dedupe_key: `fulfillment.bilder_slack:${agencyId}:${fenster}`,
  });
  if (error && error.code !== '23505') throw new Error(`Bilder-Meldung nicht geplant: ${error.message}`);
}

/** Job: alle noch nicht gemeldeten Bilder des Kunden in einer Slack-Nachricht melden */
export async function meldeNeueBilder(svc: SupabaseClient, agencyId: string): Promise<'gemeldet' | 'nichts_neu' | 'nicht_freigegeben' | 'kein_slack'> {
  const { data } = await svc.from('kunden_bilder').select('id, kategorie').eq('agency_id', agencyId).is('gemeldet_am', null);
  const neu = (data ?? []) as Array<{ id: string; kategorie: BildKategorie }>;
  if (!neu.length) return 'nichts_neu';
  // Ohne Freigabe nichts melden und nichts nachholen – die Bilder gelten trotzdem als gemeldet
  const markieren = () => svc.from('kunden_bilder').update({ gemeldet_am: new Date().toISOString() }).in('id', neu.map((b) => b.id));
  if (!(await istFreigegeben(svc, 'kunden_bilder_slack'))) {
    await markieren();
    return 'nicht_freigegeben';
  }
  const token = process.env.SLACK_BOT_TOKEN;
  const kanal = (await slackKanal('fulfillment')) ?? (await slackKanal('marketing'));
  if (!token || !kanal) return 'kein_slack';

  const { data: ag } = await svc.from('agencies').select('name').eq('id', agencyId).maybeSingle();
  const anzahl: Partial<Record<BildKategorie, number>> = {};
  for (const b of neu) anzahl[b.kategorie] = (anzahl[b.kategorie] ?? 0) + 1;
  const basis = (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://cloud.zoeppmedia.de').replace(/\/$/, '');
  const text = bilderSlackText((ag as { name: string } | null)?.name ?? 'Ein Kunde', anzahl, `${basis}/clients/${agencyId}/bilder`);

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ channel: kanal, text, unfurl_links: false }),
  });
  const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!d.ok) throw new Error(`Slack-Post fehlgeschlagen: ${d.error ?? res.status}`);
  await markieren();
  return 'gemeldet';
}
