/**
 * Daten der Team-Akademie: Start-Inhalte anlegen, Artikel laden/suchen (nur Sichtbares), Fortschritt,
 * Aufnahme-Liste. Alle Zugriffe mit dem Service-Role-Client – die Sichtbarkeit prüft darfSehen().
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { START_ARTIKEL, VIDEOS, type ArtikelDef, type ArtikelStatus, type ArtikelTyp, type SopAbschnitte } from './inhalte';
import { checklisteVon, reviewVon } from './bausteine';
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
  sop_aufnahme?: boolean;
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
    ...(ab.checkliste ?? []),
    ...(ab.review ?? []),
    a.inhalt,
  ]
    .filter(Boolean)
    .join('\n');
}

export const START_QUELLE = 'Start-Inhalt (Code)';

/** Kopie ohne ein Feld */
function ohneFeld<T extends object, K extends keyof T>(o: T, k: K): Omit<T, K> {
  const c = { ...o };
  delete c[k];
  return c;
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
    quelle: START_QUELLE,
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
    // sop_aufnahme separat (Spalte kommt aus einer späteren Migration)
    svc.from('akademie_videos').upsert(VIDEOS.map((v) => ohneFeld(v, 'sop_aufnahme')), { onConflict: 'key', ignoreDuplicates: true }),
    svc.from('akademie_artikel').upsert(START_ARTIKEL.map(zeileAusDef), { onConflict: 'slug', ignoreDuplicates: true }),
  ]);
  if (e1 || e2) {
    console.error('[akademie] Start-Inhalte', e1?.message ?? e2?.message);
    return;
  }
  try {
    await aktualisiereStartInhalte(svc);
  } catch (err) {
    console.error('[akademie] Start-Inhalte aktualisieren', err);
  }
  seedGeprueft = true;
}

/** JSON mit sortierten Schlüsseln (jsonb ordnet Schlüssel um) */
function stabil(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stabil).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v as object).filter((k) => (v as Record<string, unknown>)[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stabil((v as Record<string, unknown>)[k])}`).join(',')}}`;
  return JSON.stringify(v ?? null);
}

const vergleich = (z: ReturnType<typeof zeileAusDef> | Record<string, unknown>) =>
  stabil([z.titel, z.modul, z.positionen, z.step_keys, z.zusammenfassung, z.abschnitte, z.inhalt, z.video_key, z.prioritaet, z.reihenfolge]);

/**
 * Neue Fassungen der Start-Inhalte übernehmen: unbearbeitete Start-Artikel werden aktualisiert (Status bleibt),
 * von Admins bearbeitete Artikel bekommen nur fehlende Checkliste/Review ergänzt – ihr Text bleibt unberührt.
 */
export async function aktualisiereStartInhalte(svc: SupabaseClient): Promise<{ aktualisiert: number; ergaenzt: number }> {
  const { data, error } = await svc
    .from('akademie_artikel')
    .select('slug, typ, titel, modul, positionen, step_keys, zusammenfassung, abschnitte, inhalt, video_key, prioritaet, reihenfolge, quelle, bearbeitet_am')
    .in('slug', START_ARTIKEL.map((a) => a.slug));
  if (error) throw new Error(error.message);
  const vorhanden = new Map(((data ?? []) as Array<Record<string, unknown> & { slug: string }>).map((r) => [r.slug, r]));
  const neuFassungen: Array<Omit<ReturnType<typeof zeileAusDef>, 'status'>> = [];
  const ergaenzen: Array<{ slug: string; abschnitte: SopAbschnitte; such_text: string }> = [];
  for (const def of START_ARTIKEL) {
    const row = vorhanden.get(def.slug);
    if (!row) continue;
    const zeile = ohneFeld(zeileAusDef(def), 'status');
    if (row.quelle === START_QUELLE && !row.bearbeitet_am) {
      if (vergleich(zeile) !== vergleich(row)) neuFassungen.push(zeile);
      continue;
    }
    const ab = (row.abschnitte ?? {}) as SopAbschnitte;
    if (ab.checkliste?.length && ab.review?.length) continue;
    const basis = { typ: row.typ as ArtikelTyp, abschnitte: ab };
    const abschnitte = { ...ab, checkliste: ab.checkliste?.length ? ab.checkliste : checklisteVon(basis), review: ab.review?.length ? ab.review : reviewVon(basis) };
    ergaenzen.push({
      slug: def.slug,
      abschnitte,
      such_text: suchTextVon({ modul: String(row.modul), zusammenfassung: (row.zusammenfassung as string | null) ?? null, abschnitte, inhalt: (row.inhalt as string | null) ?? null }),
    });
  }
  if (neuFassungen.length) {
    const { error: e } = await svc.from('akademie_artikel').upsert(neuFassungen.map((z) => ({ ...z, updated_at: new Date().toISOString() })), { onConflict: 'slug' });
    if (e) throw new Error(e.message);
  }
  for (const z of ergaenzen) {
    await svc.from('akademie_artikel').update({ abschnitte: z.abschnitte, such_text: z.such_text }).eq('slug', z.slug);
  }
  // „ideal mit SOP aufnehmen“ – Fehler ignorieren, falls die Spalte noch fehlt
  const mitAufnahme = VIDEOS.filter((v) => v.sop_aufnahme).map((v) => v.key);
  if (mitAufnahme.length) {
    const { error: ev } = await svc.from('akademie_videos').update({ sop_aufnahme: true }).in('key', mitAufnahme);
    if (ev) console.warn('[akademie] sop_aufnahme', ev.message);
  }
  return { aktualisiert: neuFassungen.length, ergaenzt: ergaenzen.length };
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
  const { data } = await svc.from('akademie_videos').select('*');
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
