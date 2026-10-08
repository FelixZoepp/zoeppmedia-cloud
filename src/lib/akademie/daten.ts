/**
 * Daten der Team-Akademie: Start-Inhalte anlegen, Artikel laden/suchen (nur Sichtbares), Fortschritt,
 * Aufnahme-Liste. Alle Zugriffe mit dem Service-Role-Client – die Sichtbarkeit prüft darfSehen().
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { START_ARTIKEL, VIDEOS, type ArtikelDef, type ArtikelStatus, type ArtikelTyp, type SopAbschnitte } from './inhalte';
import { darfSehen, type Zugriff } from './zugriff';

export interface Artikel {
  slug: string;
  typ: ArtikelTyp;
  titel: string;
  modul: string;
  positionen: string[];
  step_keys: string[];
  status: ArtikelStatus;
  quelle: string | null;
  zusammenfassung: string | null;
  abschnitte: SopAbschnitte;
  inhalt: string | null;
  video_key: string | null;
  prioritaet: number;
  reihenfolge: number;
  ergaenzt_slug: string | null;
  updated_at?: string;
}

export interface Video {
  key: string;
  titel: string;
  session: string;
  session_reihenfolge: number;
  laenge_min: number;
  prioritaet: number;
  drehbuch: string[];
  video_url: string | null;
  status: 'aufnahme_noetig' | 'aufgenommen' | 'nicht_noetig';
}

export const ARTIKEL_SPALTEN =
  'slug, typ, titel, modul, positionen, step_keys, status, quelle, zusammenfassung, abschnitte, inhalt, video_key, prioritaet, reihenfolge, ergaenzt_slug, updated_at';

/** Alles Textliche eines Artikels für die Volltextsuche */
export function suchTextVon(a: Pick<Artikel, 'zusammenfassung' | 'abschnitte' | 'inhalt' | 'modul'>): string {
  const ab = a.abschnitte ?? {};
  return [
    a.modul,
    a.zusammenfassung,
    ab.zweck,
    ab.ausloeser,
    ...(ab.automatisch ?? []),
    ...(ab.schritte ?? []),
    ...(ab.qualitaet ?? []),
    ...(ab.fehler ?? []),
    a.inhalt,
  ]
    .filter(Boolean)
    .join('\n');
}

export function zeileAusDef(d: ArtikelDef) {
  const abschnitte = d.abschnitte ?? {};
  return {
    slug: d.slug,
    typ: d.typ,
    titel: d.titel,
    modul: d.modul,
    positionen: d.positionen,
    step_keys: d.step_keys ?? [],
    status: d.status,
    quelle: 'Start-Inhalt (Code)',
    zusammenfassung: d.zusammenfassung,
    abschnitte,
    inhalt: d.inhalt ?? null,
    video_key: d.video_key ?? null,
    prioritaet: d.prioritaet ?? 3,
    reihenfolge: d.reihenfolge ?? 100,
    such_text: suchTextVon({ modul: d.modul, zusammenfassung: d.zusammenfassung, abschnitte, inhalt: d.inhalt ?? null }),
  };
}

/** einmal pro Server-Instanz prüfen (createAdminClient erzeugt je Aufruf einen neuen Client) */
let seedGeprueft = false;

/** nur für Tests */
export function setzeStartInhaltePruefungZurueck(): void {
  seedGeprueft = false;
}

/** Legt fehlende Start-Artikel/Videos an – bestehende (evtl. bearbeitete) Einträge bleiben unberührt. */
export async function sichereStartInhalte(svc: SupabaseClient): Promise<void> {
  if (seedGeprueft) return;
  const [{ error: e1 }, { error: e2 }] = await Promise.all([
    svc.from('akademie_videos').upsert(VIDEOS.map((v) => ({ ...v })), { onConflict: 'key', ignoreDuplicates: true }),
    svc.from('akademie_artikel').upsert(START_ARTIKEL.map(zeileAusDef), { onConflict: 'slug', ignoreDuplicates: true }),
  ]);
  if (e1 || e2) {
    console.error('[akademie] Start-Inhalte', e1?.message ?? e2?.message);
    return;
  }
  seedGeprueft = true;
}

const sortiere = (a: Artikel, b: Artikel) => a.reihenfolge - b.reihenfolge || a.titel.localeCompare(b.titel, 'de');

export async function ladeSichtbareArtikel(svc: SupabaseClient, z: Zugriff): Promise<Artikel[]> {
  await sichereStartInhalte(svc);
  let q = svc.from('akademie_artikel').select(ARTIKEL_SPALTEN).limit(1000);
  if (!z.admin) q = q.eq('status', 'freigegeben');
  const { data, error } = await q;
  if (error) throw new Error(`Akademie: ${error.message}`);
  return ((data ?? []) as Artikel[]).filter((a) => darfSehen(a, z)).sort(sortiere);
}

export async function ladeArtikel(svc: SupabaseClient, slug: string, z: Zugriff): Promise<Artikel | null> {
  await sichereStartInhalte(svc);
  const { data } = await svc.from('akademie_artikel').select(ARTIKEL_SPALTEN).eq('slug', slug).maybeSingle();
  const a = data as Artikel | null;
  return a && darfSehen(a, z) ? a : null;
}

/** Suchbegriff für websearch_to_tsquery entschärfen */
export function suchbegriff(q: string): string {
  return q.replace(/[^\p{L}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 200);
}

/** Volltextsuche (deutsch) – liefert nur Artikel, die der Nutzer sehen darf */
export async function sucheArtikel(svc: SupabaseClient, z: Zugriff, frage: string, limit = 6): Promise<Artikel[]> {
  await sichereStartInhalte(svc);
  const begriff = suchbegriff(frage);
  if (!begriff) return [];
  const basis = () => {
    let q = svc.from('akademie_artikel').select(ARTIKEL_SPALTEN).limit(40);
    if (!z.admin) q = q.eq('status', 'freigegeben');
    return q;
  };
  // Erst alle Wörter (AND), dann irgendein Wort (OR) – Fragen sind oft länger als der Artikeltitel
  const woerter = begriff.split(' ').filter((w) => w.length > 2);
  const versuche = [begriff, woerter.join(' or ')].filter((v, i, xs) => v && xs.indexOf(v) === i);
  for (const v of versuche) {
    const { data, error } = await basis().textSearch('fts', v, { config: 'german', type: 'websearch' });
    if (error) {
      console.error('[akademie] Suche', error.message);
      continue;
    }
    const treffer = ((data ?? []) as Artikel[]).filter((a) => darfSehen(a, z));
    if (treffer.length) return treffer.slice(0, limit);
  }
  return [];
}

export async function ladeVideos(svc: SupabaseClient): Promise<Video[]> {
  await sichereStartInhalte(svc);
  const { data } = await svc.from('akademie_videos').select('key, titel, session, session_reihenfolge, laenge_min, prioritaet, drehbuch, video_url, status');
  return (data ?? []) as Video[];
}

export async function ladeFortschritt(svc: SupabaseClient, userId: string): Promise<Record<string, { gelesen: boolean; video: boolean }>> {
  const { data } = await svc.from('akademie_fortschritt').select('slug, gelesen_am, video_gesehen_am').eq('user_id', userId);
  return Object.fromEntries(
    ((data ?? []) as Array<{ slug: string; gelesen_am: string | null; video_gesehen_am: string | null }>).map((r) => [r.slug, { gelesen: !!r.gelesen_am, video: !!r.video_gesehen_am }]),
  );
}

export async function setzeFortschritt(svc: SupabaseClient, userId: string, slug: string, art: 'gelesen' | 'video'): Promise<void> {
  const jetzt = new Date().toISOString();
  const { data } = await svc.from('akademie_fortschritt').select('gelesen_am, video_gesehen_am').eq('user_id', userId).eq('slug', slug).maybeSingle();
  const alt = data as { gelesen_am: string | null; video_gesehen_am: string | null } | null;
  const { error } = await svc.from('akademie_fortschritt').upsert(
    {
      user_id: userId,
      slug,
      gelesen_am: art === 'gelesen' ? jetzt : alt?.gelesen_am ?? null,
      video_gesehen_am: art === 'video' ? jetzt : alt?.video_gesehen_am ?? null,
    },
    { onConflict: 'user_id,slug' },
  );
  if (error) throw new Error(error.message);
}

/* ── Aufnahme-Liste ─────────────────────────────────────────────────── */

export interface AufnahmeSession {
  session: string;
  gesamtMin: number;
  videos: Array<Video & { sops: Array<{ slug: string; titel: string }> }>;
}

/** Offene Videos zu Sessions bündeln (welche am Stück aufnehmen), sortiert nach Priorität */
export function gruppiereAufnahmen(videos: Video[], artikel: Array<Pick<Artikel, 'slug' | 'titel' | 'video_key'>>): { sessions: AufnahmeSession[]; gesamtMin: number; anzahl: number } {
  const offen = videos.filter((v) => v.status === 'aufnahme_noetig');
  const map = new Map<string, AufnahmeSession>();
  for (const v of offen) {
    const s = map.get(v.session) ?? { session: v.session, gesamtMin: 0, videos: [] };
    s.videos.push({ ...v, sops: artikel.filter((a) => a.video_key === v.key).map((a) => ({ slug: a.slug, titel: a.titel })) });
    s.gesamtMin += v.laenge_min;
    map.set(v.session, s);
  }
  const sessions = [...map.values()]
    .map((s) => ({ ...s, videos: s.videos.sort((a, b) => a.session_reihenfolge - b.session_reihenfolge) }))
    .sort((a, b) => Math.min(...a.videos.map((v) => v.prioritaet)) - Math.min(...b.videos.map((v) => v.prioritaet)) || a.session.localeCompare(b.session, 'de'));
  return { sessions, gesamtMin: offen.reduce((s, v) => s + v.laenge_min, 0), anzahl: offen.length };
}
