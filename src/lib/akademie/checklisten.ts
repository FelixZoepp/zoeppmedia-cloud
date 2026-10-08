/**
 * Checklisten (pro Vorgang), Review-Checklisten, Wissenschecks und Hilfe-Modus der Team-Akademie.
 * Alle Funktionen erwarten den Service-Role-Client; die Sichtbarkeit prüft der Aufrufer (ladeArtikel).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { checklisteVon, offenePunkte, reviewVon } from './bausteine';
import { ladeArtikel, ladeVideos, type Artikel } from './daten';
import { hilfeSlugs, pfadMuster } from './hilfe-zuordnung';
import { merkeLuecke } from './bot';
import { storageVideoUrl } from './aufnahme';
import { werteAus, type Auswertung } from './wissenscheck';
import type { Zugriff } from './zugriff';

const MAX_KONTEXT = 200;
export const kontextSauber = (k: unknown) => (typeof k === 'string' ? k.slice(0, MAX_KONTEXT) : '');
const indizes = (v: unknown, max: number) =>
  [...new Set((Array.isArray(v) ? v : []).filter((i): i is number => Number.isInteger(i) && i >= 0 && i < max))].sort((a, b) => a - b);

/* ── Baustein 3: Checkliste ─────────────────────────────────────────── */

export async function ladeCheckliste(svc: SupabaseClient, userId: string, slug: string, kontext: string): Promise<number[]> {
  const { data } = await svc.from('akademie_checklisten').select('erledigt').eq('user_id', userId).eq('slug', slug).eq('kontext', kontext).maybeSingle();
  return ((data as { erledigt: number[] } | null)?.erledigt ?? []).slice();
}

export async function speichereCheckliste(svc: SupabaseClient, userId: string, a: Artikel, kontext: string, erledigt: unknown): Promise<{ erledigt: number[]; komplett: boolean }> {
  const punkte = checklisteVon(a);
  const liste = indizes(erledigt, punkte.length);
  const komplett = punkte.length > 0 && liste.length === punkte.length;
  const { error } = await svc.from('akademie_checklisten').upsert(
    { user_id: userId, slug: a.slug, kontext, erledigt: liste, abgeschlossen_am: komplett ? new Date().toISOString() : null, updated_at: new Date().toISOString() },
    { onConflict: 'user_id,slug,kontext' },
  );
  if (error) throw new Error(error.message);
  return { erledigt: liste, komplett };
}

/* ── Baustein 4: Review ─────────────────────────────────────────────── */

export type ReviewStatus = 'selbstcheck' | 'zur_pruefung' | 'geprueft' | 'nacharbeit';
export interface Review {
  id: string;
  user_id: string;
  slug: string;
  kontext: string;
  erledigt: number[];
  notiz: string | null;
  status: ReviewStatus;
  pruefer_kommentar: string | null;
  updated_at: string;
}

export async function ladeReview(svc: SupabaseClient, userId: string, slug: string, kontext: string): Promise<Review | null> {
  const { data } = await svc.from('akademie_reviews').select('*').eq('user_id', userId).eq('slug', slug).eq('kontext', kontext).maybeSingle();
  return (data as Review | null) ?? null;
}

export async function speichereReview(
  svc: SupabaseClient,
  userId: string,
  a: Artikel,
  kontext: string,
  eingabe: { erledigt?: unknown; notiz?: unknown; zurPruefung?: unknown },
): Promise<Review> {
  const punkte = reviewVon(a);
  const alt = await ladeReview(svc, userId, a.slug, kontext);
  const status: ReviewStatus = eingabe.zurPruefung === true ? 'zur_pruefung' : alt?.status === 'zur_pruefung' || alt?.status === 'geprueft' ? alt.status : 'selbstcheck';
  const zeile = {
    user_id: userId,
    slug: a.slug,
    kontext,
    erledigt: indizes(eingabe.erledigt ?? alt?.erledigt, punkte.length),
    notiz: typeof eingabe.notiz === 'string' ? eingabe.notiz.slice(0, 2000) : alt?.notiz ?? null,
    status,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await svc.from('akademie_reviews').upsert(zeile, { onConflict: 'user_id,slug,kontext' }).select('*').maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Review | null) ?? ({ ...zeile, id: alt?.id ?? '', pruefer_kommentar: alt?.pruefer_kommentar ?? null } as Review);
}

/** Admin: Review prüfen */
export async function pruefeReview(svc: SupabaseClient, id: string, prueferId: string, ergebnis: 'geprueft' | 'nacharbeit', kommentar: string | null): Promise<void> {
  const { error } = await svc
    .from('akademie_reviews')
    .update({ status: ergebnis, pruefer_id: prueferId, pruefer_kommentar: kommentar?.slice(0, 2000) ?? null, geprueft_am: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/* ── Wissenscheck ───────────────────────────────────────────────────── */

export async function speichereWissenscheck(svc: SupabaseClient, userId: string, bereich: string, antworten: Record<string, number>): Promise<Auswertung> {
  const a = werteAus(bereich, antworten);
  const { error } = await svc.from('akademie_wissenschecks').insert({ user_id: userId, bereich, richtig: a.richtig, gesamt: a.gesamt, bestanden: a.bestanden, antworten });
  if (error) throw new Error(error.message);
  return a;
}

export async function letzterWissenscheck(svc: SupabaseClient, userId: string, bereich: string) {
  const { data } = await svc
    .from('akademie_wissenschecks')
    .select('richtig, gesamt, bestanden, created_at')
    .eq('user_id', userId)
    .eq('bereich', bereich)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { richtig: number; gesamt: number; bestanden: boolean; created_at: string } | null) ?? null;
}

/* ── Erledigen trotz offener Checkliste ─────────────────────────────── */

export async function protokolliereErledigtHinweis(svc: SupabaseClient, userId: string, slug: string, kontext: string, offene: string[], aktion: 'trotzdem' | 'zur_checkliste') {
  await svc.from('akademie_erledigt_hinweise').insert({ user_id: userId, slug, kontext, offene_punkte: offene.slice(0, 50), aktion });
}

/* ── Hilfe-Modus ────────────────────────────────────────────────────── */

export async function ladeHilfeModus(svc: SupabaseClient, userId: string, admin: boolean): Promise<boolean> {
  const { data } = await svc.from('akademie_einstellungen').select('hilfe_modus').eq('user_id', userId).maybeSingle();
  const r = data as { hilfe_modus: boolean } | null;
  return r ? r.hilfe_modus : !admin;
}

export async function setzeHilfeModus(svc: SupabaseClient, userId: string, an: boolean): Promise<void> {
  const { error } = await svc.from('akademie_einstellungen').upsert({ user_id: userId, hilfe_modus: an, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw new Error(error.message);
}

export interface HilfeThema {
  slug: string;
  titel: string;
  typ: string;
  zusammenfassung: string | null;
  schritte: string[];
  automatisch: string[];
  checkliste: string[];
  review: string[];
  video: { titel: string; url: string | null; datei: boolean; status: string; laenge_min: number } | null;
  erledigt: number[];
  reviewStand: { erledigt: number[]; status: ReviewStatus } | null;
}

/**
 * Hilfe zur aktuellen Seite/Aufgabe: nur sichtbare Artikel, mit Checkliste dieses Vorgangs.
 * Gibt es zur Zuordnung nichts Freigegebenes, wird eine Wissenslücke gemeldet.
 */
export async function hilfeFuer(
  svc: SupabaseClient,
  z: Zugriff,
  userId: string,
  opts: { pfad: string; stepKey?: string | null; kontext: string; meldeLuecke?: boolean },
): Promise<{ themen: HilfeThema[]; zugeordnet: boolean; keineAnleitung: boolean }> {
  const slugs = hilfeSlugs({ pfad: opts.pfad, stepKey: opts.stepKey });
  const artikel = (await Promise.all(slugs.map((s) => ladeArtikel(svc, s, z)))).filter((a): a is Artikel => !!a);
  if (!artikel.length) {
    const frage = opts.stepKey ? `Anleitung für Aufgabe „${opts.stepKey}“` : `Anleitung für Seite ${pfadMuster(opts.pfad)}`;
    // Nur wenn jemand die Hilfe wirklich braucht (Leiste geöffnet oder Aufgabe) – nicht bei jedem Seitenaufruf
    if (opts.meldeLuecke) await merkeLuecke(svc, frage, z.admin ? [] : [...z.positionen]).catch(() => undefined);
    return { themen: [], zugeordnet: slugs.length > 0, keineAnleitung: true };
  }
  const videos = await ladeVideos(svc);
  const themen = await Promise.all(
    artikel.map(async (a) => {
      const v = a.video_key ? videos.find((x) => x.key === a.video_key) ?? null : null;
      const [erledigt, rv, datei] = await Promise.all([
        ladeCheckliste(svc, userId, a.slug, opts.kontext),
        ladeReview(svc, userId, a.slug, opts.kontext),
        v?.video_url ? storageVideoUrl(svc, v.video_url).catch(() => null) : Promise.resolve(null),
      ]);
      return {
        slug: a.slug,
        titel: a.titel,
        typ: a.typ,
        zusammenfassung: a.zusammenfassung,
        schritte: a.abschnitte?.schritte ?? [],
        automatisch: a.abschnitte?.automatisch ?? [],
        checkliste: checklisteVon(a),
        review: reviewVon(a),
        video: v ? { titel: v.titel, url: datei ?? v.video_url, datei: !!datei, status: v.status, laenge_min: v.laenge_min } : null,
        erledigt,
        reviewStand: rv ? { erledigt: rv.erledigt, status: rv.status } : null,
      };
    }),
  );
  return { themen, zugeordnet: true, keineAnleitung: false };
}

/** Offene Punkte der Checkliste zur Aufgabe (für den Hinweis beim Erledigen) */
export async function offeneCheckliste(svc: SupabaseClient, z: Zugriff, userId: string, slug: string, kontext: string): Promise<{ titel: string; offen: string[] } | null> {
  const a = await ladeArtikel(svc, slug, z);
  if (!a) return null;
  const punkte = checklisteVon(a);
  if (!punkte.length) return null;
  return { titel: a.titel, offen: offenePunkte(punkte, await ladeCheckliste(svc, userId, slug, kontext)) };
}
