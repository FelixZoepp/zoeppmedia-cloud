/**
 * SOP aus Aufnahme: Audio, Bildschirm + Mikrofon oder hochgeladene Datei → Transkript (Whisper)
 * → Claude erzeugt einen SOP-Entwurf (mit Standbildern) → zweiter Durchgang prüft auf Lücken und
 * liefert „Offene Fragen an Felix“. Ergebnis ist immer ein Entwurf – Freigabe wie bei allen Artikeln.
 *
 * Rohdateien liegen im privaten Bucket „akademie-aufnahmen“ und laufen nie durch die Vercel-Funktion
 * (Upload direkt vom Browser per signierter URL).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { STEPS } from '@/lib/fulfillment/catalog';
import { ARTIKEL_SPALTEN, suchTextVon, type Artikel } from './daten';
import { AKADEMIE_IMPORT_MODELL, standardKiMitBildern, type KiBildFn } from './ki';
import { POSITIONEN, istPosition } from './positionen';
import { MODULE, type SopAbschnitte } from './inhalte';
import { slugify } from './import';

export const AUFNAHME_BUCKET = 'akademie-aufnahmen';
export const MAX_DAUER_SEK = 20 * 60;
export const MAX_BILDER = 40;
/** Whisper nimmt höchstens 25 MB pro Datei */
export const MAX_AUDIO_TEIL_BYTES = 24 * 1024 * 1024;
export const MAX_AUDIO_TEILE = 6;
export const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
/** Nach so vielen Minuten gilt eine laufende Verarbeitung als hängengeblieben */
export const HAENGT_NACH_MIN = 12;
export const MAX_VERSUCHE = 3;

export type AufnahmeModus = 'audio' | 'bildschirm' | 'datei';
export type AufnahmeStatus = 'hochladen' | 'wartet' | 'transkription' | 'entwurf' | 'pruefung' | 'fertig' | 'fehler';

export interface OffeneFrage {
  frage: string;
  antwort?: string | null;
}

export interface Aufnahme {
  id: string;
  erstellt_von: string | null;
  modus: AufnahmeModus;
  titel: string;
  hinweis: string | null;
  kontext: { pfad?: string; seitentitel?: string; kunde_id?: string; schritt?: string };
  video_pfad: string | null;
  audio_pfade: string[];
  bild_pfade: string[];
  dauer_sek: number | null;
  groesse_bytes: number | null;
  status: AufnahmeStatus;
  fehler: string | null;
  transkript: string | null;
  artikel_slug: string | null;
  video_key: string | null;
  offene_fragen: OffeneFrage[];
  versuche: number;
  verarbeitung_seit: string | null;
  created_at: string;
  updated_at: string;
}

export const AUFNAHME_SPALTEN =
  'id, erstellt_von, modus, titel, hinweis, kontext, video_pfad, audio_pfade, bild_pfade, dauer_sek, groesse_bytes, status, fehler, transkript, artikel_slug, video_key, offene_fragen, versuche, verarbeitung_seit, created_at, updated_at';

/* ── Berechtigung ─────────────────────────────────────────────────── */

export async function erlaubteNutzer(svc: SupabaseClient): Promise<string[]> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'akademie_aufnahme_erlaubt').maybeSingle();
  return String((data as { wert?: string } | null)?.wert ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Admins immer, sonst nur ausdrücklich freigeschaltete Mitarbeiter */
export async function darfAufnehmen(svc: SupabaseClient, user: { id: string; role: string }): Promise<boolean> {
  if (user.role === 'admin') return true;
  if (user.role !== 'employee') return false;
  return (await erlaubteNutzer(svc)).includes(user.id);
}

/* ── Anlegen + Upload-Pfade ───────────────────────────────────────── */

export interface AnlageEingabe {
  modus: AufnahmeModus;
  titel: string;
  hinweis?: string | null;
  kontext?: Aufnahme['kontext'];
  audioTeile: number;
  bilder: number;
  video: { mime: string; bytes: number } | null;
  /** MIME der Audio-Teile (Safari nimmt audio/mp4 auf) – bestimmt die Dateiendung für Whisper */
  audioMime?: string | null;
  dauerSek: number | null;
  groesseBytes: number | null;
}

export function pruefeAnlage(e: AnlageEingabe): string | null {
  if (!['audio', 'bildschirm', 'datei'].includes(e.modus)) return 'Unbekannter Aufnahme-Modus';
  if (!e.titel?.trim()) return 'Bitte einen Titel angeben';
  if (!Number.isInteger(e.audioTeile) || e.audioTeile < 1 || e.audioTeile > MAX_AUDIO_TEILE) return 'Audio fehlt oder ist zu lang';
  if (!Number.isInteger(e.bilder) || e.bilder < 0 || e.bilder > MAX_BILDER) return `Höchstens ${MAX_BILDER} Standbilder`;
  if (e.dauerSek !== null && e.dauerSek > MAX_DAUER_SEK + 30) return 'Aufnahmen dürfen höchstens 20 Minuten lang sein';
  if (e.video && e.video.bytes > MAX_VIDEO_BYTES) return 'Das Video ist größer als 500 MB';
  if (e.video && !/^video\//.test(e.video.mime)) return 'Ungültiger Video-Typ';
  return null;
}

function endung(mime: string): string {
  if (mime.includes('mp4')) return 'mp4';
  if (mime.includes('quicktime')) return 'mov';
  return 'webm';
}

/** Legt die Aufnahme an und gibt die Speicherpfade zurück, für die der Browser hochladen darf */
export async function legeAufnahmeAn(
  svc: SupabaseClient,
  e: AnlageEingabe,
  userId: string,
): Promise<{ id: string; pfade: Array<{ art: 'video' | 'audio' | 'bild'; index: number; pfad: string }> }> {
  const { data, error } = await svc
    .from('akademie_aufnahmen')
    .insert({
      erstellt_von: userId,
      modus: e.modus,
      titel: e.titel.trim().slice(0, 200),
      hinweis: e.hinweis?.trim().slice(0, 2000) || null,
      kontext: e.kontext ?? {},
      dauer_sek: e.dauerSek,
      groesse_bytes: e.groesseBytes,
      status: 'hochladen',
    })
    .select('id')
    .maybeSingle();
  if (error || !data) throw new Error(error?.message ?? 'Aufnahme konnte nicht angelegt werden');
  const id = (data as { id: string }).id;

  const pfade: Array<{ art: 'video' | 'audio' | 'bild'; index: number; pfad: string }> = [];
  for (let i = 0; i < e.audioTeile; i++) pfade.push({ art: 'audio', index: i, pfad: `${id}/audio-${i}.${e.modus === 'datei' ? 'wav' : e.audioMime?.includes('mp4') ? 'm4a' : 'webm'}` });
  for (let i = 0; i < e.bilder; i++) pfade.push({ art: 'bild', index: i, pfad: `${id}/bild-${String(i).padStart(2, '0')}.jpg` });
  if (e.video) pfade.push({ art: 'video', index: 0, pfad: `${id}/video.${endung(e.video.mime)}` });

  await svc
    .from('akademie_aufnahmen')
    .update({
      audio_pfade: pfade.filter((p) => p.art === 'audio').map((p) => p.pfad),
      bild_pfade: pfade.filter((p) => p.art === 'bild').map((p) => p.pfad),
      video_pfad: pfade.find((p) => p.art === 'video')?.pfad ?? null,
    })
    .eq('id', id);
  return { id, pfade };
}

/* ── Verarbeitung ─────────────────────────────────────────────────── */

export interface VerarbeitungsDeps {
  ladeDatei?: (pfad: string) => Promise<Buffer>;
  transkribiere?: (buffer: Buffer, name: string) => Promise<string>;
  ki?: KiBildFn;
  benachrichtige?: (svc: SupabaseClient, a: Aufnahme, text: string) => Promise<void>;
  jetzt?: () => Date;
}

const standardLadeDatei = (svc: SupabaseClient) => async (pfad: string): Promise<Buffer> => {
  const { data, error } = await svc.storage.from(AUFNAHME_BUCKET).download(pfad);
  if (error || !data) throw new Error(`Datei ${pfad} fehlt im Speicher – Upload unvollständig?`);
  return Buffer.from(await data.arrayBuffer());
};

const standardTranskribiere = async (buffer: Buffer, name: string): Promise<string> => {
  const { transcribeAudio } = await import('@/lib/recordings/transcribe');
  return transcribeAudio(buffer, name);
};

const standardBenachrichtige = async (svc: SupabaseClient, a: Aufnahme, text: string) => {
  if (!a.erstellt_von) return;
  const { createNotification } = await import('@/lib/notifications/create');
  await createNotification(svc, { user_id: a.erstellt_von, title: text, body: a.titel, type: 'system', push_url: '/admin/akademie?tab=sop' }).catch(() => {});
};

/** Darf diese Aufnahme jetzt (erneut) verarbeitet werden? */
export function istVerarbeitbar(a: Pick<Aufnahme, 'status' | 'verarbeitung_seit' | 'versuche'>, jetzt: Date, erzwingen = false): boolean {
  if (a.status === 'hochladen') return false;
  if (a.status === 'wartet') return true;
  if (a.status === 'fehler' || a.status === 'fertig') return erzwingen;
  // läuft gerade: nur übernehmen, wenn hängengeblieben
  const seit = a.verarbeitung_seit ? new Date(a.verarbeitung_seit).getTime() : 0;
  return jetzt.getTime() - seit > HAENGT_NACH_MIN * 60_000 && a.versuche < MAX_VERSUCHE;
}

async function setze(svc: SupabaseClient, id: string, patch: Record<string, unknown>) {
  await svc.from('akademie_aufnahmen').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
}

function jsonAus(text: string): unknown {
  const start = text.indexOf('{');
  const ende = text.lastIndexOf('}');
  if (start < 0 || ende <= start) return null;
  try {
    return JSON.parse(text.slice(start, ende + 1));
  } catch {
    return null;
  }
}

const sopSchema = z.object({
  aktion: z.enum(['neu', 'ergaenzung']).default('neu'),
  ziel_slug: z.string().nullable().optional(),
  titel: z.string().min(3).max(140),
  modul: z.string().max(60).optional(),
  positionen: z.array(z.string()).default([]),
  step_keys: z.array(z.string()).default([]),
  zusammenfassung: z.string().max(500).default(''),
  abschnitte: z.object({
    zweck: z.string().default(''),
    ausloeser: z.string().default(''),
    automatisch: z.array(z.string()).default([]),
    schritte: z.array(z.string()).min(1),
    qualitaet: z.array(z.string()).default([]),
    fehler: z.array(z.string()).default([]),
    links: z.array(z.object({ label: z.string(), href: z.string() })).default([]),
  }),
  offene_fragen: z.array(z.string()).default([]),
});
export type SopEntwurf = z.infer<typeof sopSchema>;

const FORMAT = [
  'Antworte ausschließlich mit JSON in genau diesem Format:',
  '{"aktion":"neu|ergaenzung","ziel_slug":null,"titel":"…","modul":"…","positionen":["…"],"step_keys":["…"],"zusammenfassung":"…",',
  '"abschnitte":{"zweck":"…","ausloeser":"…","automatisch":["…"],"schritte":["…"],"qualitaet":["…"],"fehler":["…"],"links":[{"label":"…","href":"/pfad"}]},',
  '"offene_fragen":["…"]}',
].join('\n');

function regeln(): string {
  return [
    'Du schreibst SOPs (Standard Operating Procedures) für die Team-Akademie einer Recruiting-Agentur.',
    'Quelle ist eine Aufnahme des Inhabers (Transkript, ggf. Standbilder seines Bildschirms) und die Seite der Cloud, auf der er aufgenommen hat.',
    'Ziel: eine SOP, nach der ein neuer Mitarbeiter die Aufgabe OHNE Rückfrage richtig erledigt („bulletproof“).',
    'Regeln:',
    '- Nur Inhalte aus der Quelle. Nichts erfinden. Was unklar ist oder fehlt, kommt in offene_fragen – nicht als Fakt in die SOP.',
    '- Deutsch, du-Form, knapp. Jeder Schritt in „schritte“ ist EINE Handlung, beginnt mit einem Verb und nennt exakte Klickpfade, Knopf- und Feldnamen, wie sie auf den Standbildern/im Transkript vorkommen (z. B. „Klicke im Kunden-Ablauf auf „Kampagne starten““).',
    '- Entscheidungen als Regel formulieren: „Wenn …, dann …“. Voraussetzungen in „ausloeser“ nennen.',
    '- „automatisch“ = was die Cloud/KI laut Quelle selbst erledigt; „qualitaet“ = woran man sieht, dass es richtig ist; „fehler“ = typische Fehler und wie man sie vermeidet.',
    '- links nur mit internen Pfaden, die in der Quelle oder im Seitenkontext vorkommen.',
    `- positionen nur aus: ${POSITIONEN.map((p) => p.id).join(', ')}.`,
    `- modul möglichst aus: ${MODULE.join(', ')}.`,
    '- step_keys nur aus der Liste der Ablauf-Schritte.',
    '- Passt die Aufnahme zu einem bestehenden Artikel, aktion "ergaenzung" mit ziel_slug aus der Liste, sonst "neu".',
  ].join('\n');
}

function kontextText(a: Aufnahme, artikelListe: string): string {
  const k = a.kontext ?? {};
  return [
    `Titel der Aufnahme: ${a.titel}`,
    a.hinweis ? `Hinweis des Inhabers: ${a.hinweis}` : '',
    `Aufgenommen auf: ${k.seitentitel ?? '–'} (${k.pfad ?? '–'})${k.schritt ? ` · Ablauf-Schritt ${k.schritt}` : ''}`,
    `Ablauf-Schritte (key | titel):\n${STEPS.map((s) => `${s.key} | ${s.titel}`).join('\n')}`,
    `Bestehende Artikel (slug | titel | typ):\n${artikelListe || '–'}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function sopZuMarkdown(e: Pick<SopEntwurf, 'zusammenfassung' | 'abschnitte'>): string {
  const ab = e.abschnitte;
  const liste = (x: string[], n = false) => x.map((s, i) => (n ? `${i + 1}. ${s}` : `- ${s}`)).join('\n');
  return [
    e.zusammenfassung,
    ab.zweck && `## Wozu\n${ab.zweck}`,
    ab.ausloeser && `## Wann\n${ab.ausloeser}`,
    ab.automatisch.length && `## Das macht die Cloud automatisch\n${liste(ab.automatisch)}`,
    ab.schritte.length && `## Das machst du\n${liste(ab.schritte, true)}`,
    ab.qualitaet.length && `## Qualitätscheck\n${liste(ab.qualitaet)}`,
    ab.fehler.length && `## Häufige Fehler\n${liste(ab.fehler)}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function ladeBilder(pfade: string[], ladeDatei: (p: string) => Promise<Buffer>) {
  const bilder: Array<{ base64: string; mime: 'image/jpeg' }> = [];
  for (const p of pfade.slice(0, MAX_BILDER)) {
    try {
      bilder.push({ base64: (await ladeDatei(p)).toString('base64'), mime: 'image/jpeg' });
    } catch {
      // einzelnes fehlendes Standbild ist kein Abbruchgrund
    }
  }
  return bilder;
}

/**
 * Komplette Verarbeitung einer Aufnahme. Atomar übernommen (bedingtes Update), damit Tick und Knopf
 * nicht doppelt arbeiten. Gibt den Endstatus zurück.
 */
export async function verarbeiteAufnahme(
  svc: SupabaseClient,
  id: string,
  deps: VerarbeitungsDeps & { erzwingen?: boolean } = {},
): Promise<AufnahmeStatus | 'uebersprungen'> {
  const jetzt = deps.jetzt?.() ?? new Date();
  const { data } = await svc.from('akademie_aufnahmen').select(AUFNAHME_SPALTEN).eq('id', id).maybeSingle();
  const a = data as Aufnahme | null;
  if (!a || !istVerarbeitbar(a, jetzt, deps.erzwingen)) return 'uebersprungen';

  // Übernehmen: nur wenn sich Status/Versuche seit dem Lesen nicht geändert haben
  const { data: claim } = await svc
    .from('akademie_aufnahmen')
    .update({ status: 'transkription', fehler: null, versuche: a.versuche + 1, verarbeitung_seit: jetzt.toISOString(), updated_at: jetzt.toISOString() })
    .eq('id', id)
    .eq('status', a.status)
    .eq('versuche', a.versuche)
    .select('id');
  if (!claim || (claim as unknown[]).length === 0) return 'uebersprungen';

  const ladeDatei = deps.ladeDatei ?? standardLadeDatei(svc);
  const transkribiere = deps.transkribiere ?? standardTranskribiere;
  const ki = deps.ki ?? standardKiMitBildern;
  const benachrichtige = deps.benachrichtige ?? standardBenachrichtige;

  try {
    // 1 · Transkript (bei erneuter Verarbeitung vorhandenes Transkript wiederverwenden)
    let transkript = a.transkript?.trim() ?? '';
    if (!transkript) {
      const teile: string[] = [];
      for (const pfad of a.audio_pfade) {
        const buffer = await ladeDatei(pfad);
        if (buffer.length > 25 * 1024 * 1024) throw new Error('Audio-Teil größer als 25 MB');
        if (buffer.length < 1000) continue;
        teile.push((await transkribiere(buffer, pfad.split('/').pop() ?? 'audio.webm')).trim());
      }
      transkript = teile.filter(Boolean).join('\n\n');
      if (transkript.length < 30) throw new Error('In der Aufnahme wurde (fast) nichts gesprochen – bitte erneut aufnehmen.');
      await setze(svc, id, { transkript, status: 'entwurf' });
    } else {
      await setze(svc, id, { status: 'entwurf' });
    }

    const bilder = await ladeBilder(a.bild_pfade, ladeDatei);
    const { data: vorhanden } = await svc.from('akademie_artikel').select('slug, titel, typ, positionen').limit(500);
    const artikel = (vorhanden ?? []) as Array<{ slug: string; titel: string; typ: string }>;
    const artikelListe = artikel.map((x) => `${x.slug} | ${x.titel} | ${x.typ}`).join('\n');
    const kontext = kontextText(a, artikelListe);
    const quelle = `Transkript:\n${transkript.slice(0, 60_000)}${bilder.length ? `\n\n(${bilder.length} Standbilder des Bildschirms in zeitlicher Reihenfolge sind angehängt.)` : ''}`;

    // 2 · Entwurf
    const roh1 = await ki({ model: AKADEMIE_IMPORT_MODELL, maxTokens: 6000, system: `${regeln()}\n\n${FORMAT}`, prompt: `${kontext}\n\n${quelle}`, bilder });
    const e1 = sopSchema.safeParse(jsonAus(roh1));
    if (!e1.success) throw new Error('Die KI hat keinen verwertbaren SOP-Entwurf geliefert.');
    await setze(svc, id, { status: 'pruefung' });

    // 3 · Prüf-Durchgang: Lücken, Mehrdeutigkeiten, Voraussetzungen, Entscheidungsregeln, Sonderfälle
    const pruefSystem = [
      regeln(),
      'Du bist jetzt der strenge Prüfer. Prüfe den Entwurf Satz für Satz gegen Transkript und Standbilder:',
      '- Stimmt jeder Schritt mit der Quelle überein? Entferne alles, was nicht belegt ist.',
      '- Fehlen Schritte, Voraussetzungen, Zugänge, Entscheidungsregeln („wenn X, dann Y“) oder Sonderfälle, die in der Quelle vorkommen? Ergänze sie.',
      '- Ist ein Schritt mehrdeutig (welcher Knopf, welches Feld, welcher Wert)? Präzisiere ihn aus der Quelle – sonst offene Frage.',
      '- offene_fragen: nur echte Lücken, die ein neuer Mitarbeiter nicht selbst beantworten könnte, als konkrete Frage an Felix (höchstens 10).',
      FORMAT,
    ].join('\n');
    const roh2 = await ki({
      model: AKADEMIE_IMPORT_MODELL,
      maxTokens: 6000,
      system: pruefSystem,
      prompt: `${kontext}\n\n${quelle}\n\nEntwurf zur Prüfung:\n${JSON.stringify(e1.data)}`,
      bilder,
    });
    const e2 = sopSchema.safeParse(jsonAus(roh2));
    const sop = e2.success ? e2.data : e1.data;

    // 4 · Speichern (Entwurf) + Video verknüpfen
    const slug = await speichereEntwurf(svc, a, sop, artikel.map((x) => x.slug));
    const videoKey = a.video_pfad ? await verknuepfeVideo(svc, a, slug, sop.titel) : null;
    const fragen: OffeneFrage[] = sop.offene_fragen.slice(0, 10).map((frage) => ({ frage, antwort: null }));
    await setze(svc, id, { status: 'fertig', artikel_slug: slug, video_key: videoKey, offene_fragen: fragen, verarbeitung_seit: null });
    await benachrichtige(svc, a, fragen.length ? `SOP-Entwurf fertig – ${fragen.length} offene Fragen` : 'SOP-Entwurf fertig');
    return 'fertig';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await setze(svc, id, { status: 'fehler', fehler: msg.slice(0, 500), verarbeitung_seit: null });
    await benachrichtige(svc, a, 'SOP aus Aufnahme fehlgeschlagen').catch(() => {});
    return 'fehler';
  }
}

async function speichereEntwurf(svc: SupabaseClient, a: Aufnahme, sop: SopEntwurf, vorhandeneSlugs: string[]): Promise<string> {
  const ziel = sop.aktion === 'ergaenzung' && sop.ziel_slug && vorhandeneSlugs.includes(sop.ziel_slug) ? sop.ziel_slug : null;
  const positionen = sop.positionen.filter(istPosition);
  const stepKeys = sop.step_keys.filter((k) => STEPS.some((s) => s.key === k));
  const modul = sop.modul?.trim() || 'Grundlagen';
  const abschnitte: SopAbschnitte = { ...sop.abschnitte, links: sop.abschnitte.links.filter((l) => l.href.startsWith('/')) };
  const inhalt = sopZuMarkdown({ zusammenfassung: sop.zusammenfassung, abschnitte: sop.abschnitte });
  const slug = a.artikel_slug ?? `${slugify(sop.titel) || 'sop'}-${Date.now().toString(36)}`;
  const zeile = {
    slug,
    typ: 'sop',
    titel: ziel ? `Ergänzung: ${sop.titel}` : sop.titel,
    modul,
    positionen: positionen.length ? positionen : ['grundlagen'],
    step_keys: ziel ? [] : stepKeys,
    status: 'entwurf',
    quelle: `Aufnahme (${a.modus}): ${a.titel}`.slice(0, 300),
    zusammenfassung: sop.zusammenfassung,
    abschnitte,
    inhalt,
    ergaenzt_slug: ziel,
    such_text: suchTextVon({ modul, zusammenfassung: sop.zusammenfassung, abschnitte, inhalt }),
    updated_at: new Date().toISOString(),
  };
  // Bei erneuter Verarbeitung denselben Entwurf überschreiben, solange er noch Entwurf ist
  if (a.artikel_slug) {
    const { data } = await svc.from('akademie_artikel').select('status').eq('slug', a.artikel_slug).maybeSingle();
    if ((data as { status?: string } | null)?.status === 'entwurf') {
      await svc.from('akademie_artikel').update(zeile).eq('slug', a.artikel_slug);
      return a.artikel_slug;
    }
    const neu = `${slugify(sop.titel) || 'sop'}-${Date.now().toString(36)}`;
    const { error } = await svc.from('akademie_artikel').insert({ ...zeile, slug: neu });
    if (error) throw new Error(error.message);
    return neu;
  }
  const { error } = await svc.from('akademie_artikel').insert(zeile);
  if (error) throw new Error(error.message);
  return slug;
}

async function verknuepfeVideo(svc: SupabaseClient, a: Aufnahme, slug: string, titel: string): Promise<string> {
  const key = a.video_key ?? `aufnahme_${a.id.slice(0, 8)}`;
  await svc.from('akademie_videos').upsert(
    {
      key,
      titel,
      session: 'Aus Aufnahmen',
      session_reihenfolge: 99,
      laenge_min: Math.max(1, Math.round((a.dauer_sek ?? 60) / 60)),
      prioritaet: 3,
      drehbuch: [],
      video_url: `storage:${AUFNAHME_BUCKET}/${a.video_pfad}`,
      status: 'aufgenommen',
      aufgenommen_am: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'key' },
  );
  await svc.from('akademie_artikel').update({ video_key: key }).eq('slug', slug);
  return key;
}

/** Storage-Video („storage:bucket/pfad“) → signierte URL; sonst null */
export async function storageVideoUrl(svc: SupabaseClient, videoUrl: string | null, sekunden = 3600): Promise<string | null> {
  if (!videoUrl?.startsWith('storage:')) return null;
  const rest = videoUrl.slice('storage:'.length);
  const i = rest.indexOf('/');
  if (i < 0) return null;
  const { data } = await svc.storage.from(rest.slice(0, i)).createSignedUrl(rest.slice(i + 1), sekunden);
  return data?.signedUrl ?? null;
}

/* ── Offene Fragen beantworten ────────────────────────────────────── */

/**
 * Felix beantwortet offene Fragen (Text und/oder transkribierte Sprachnachricht) → die KI arbeitet die
 * Antworten in den Entwurf ein; was noch fehlt, bleibt als offene Frage stehen.
 */
export async function beantworteFragen(
  svc: SupabaseClient,
  id: string,
  antwortText: string,
  deps: { ki?: KiBildFn } = {},
): Promise<{ offene_fragen: OffeneFrage[] }> {
  const { data } = await svc.from('akademie_aufnahmen').select(AUFNAHME_SPALTEN).eq('id', id).maybeSingle();
  const a = data as Aufnahme | null;
  if (!a?.artikel_slug) throw new Error('Zu dieser Aufnahme gibt es noch keinen Entwurf.');
  const antwort = antwortText.trim();
  if (antwort.length < 3) throw new Error('Bitte eine Antwort eingeben oder aufnehmen.');
  const { data: artRoh } = await svc.from('akademie_artikel').select(ARTIKEL_SPALTEN).eq('slug', a.artikel_slug).maybeSingle();
  const artikel = artRoh as Artikel | null;
  if (!artikel) throw new Error('Der Entwurf existiert nicht mehr.');

  const bisher: SopEntwurf = {
    aktion: artikel.ergaenzt_slug ? 'ergaenzung' : 'neu',
    ziel_slug: artikel.ergaenzt_slug,
    titel: artikel.titel.replace(/^Ergänzung: /, ''),
    modul: artikel.modul,
    positionen: artikel.positionen,
    step_keys: artikel.step_keys,
    zusammenfassung: artikel.zusammenfassung ?? '',
    abschnitte: {
      zweck: artikel.abschnitte?.zweck ?? '',
      ausloeser: artikel.abschnitte?.ausloeser ?? '',
      automatisch: artikel.abschnitte?.automatisch ?? [],
      schritte: artikel.abschnitte?.schritte?.length ? artikel.abschnitte.schritte : ['(leer)'],
      qualitaet: artikel.abschnitte?.qualitaet ?? [],
      fehler: artikel.abschnitte?.fehler ?? [],
      links: artikel.abschnitte?.links ?? [],
    },
    offene_fragen: a.offene_fragen.filter((f) => !f.antwort).map((f) => f.frage),
  };

  const roh = await (deps.ki ?? standardKiMitBildern)({
    model: AKADEMIE_IMPORT_MODELL,
    maxTokens: 6000,
    system: [
      regeln(),
      'Der Inhaber hat offene Fragen zu diesem SOP-Entwurf beantwortet. Arbeite die Antworten in die passenden Abschnitte ein.',
      'Entferne beantwortete Fragen aus offene_fragen. Neue Fragen nur, wenn die Antwort eine neue echte Lücke aufmacht.',
      FORMAT,
    ].join('\n'),
    prompt: `Bisheriger Entwurf:\n${JSON.stringify(bisher)}\n\nTranskript der ursprünglichen Aufnahme (Auszug):\n${(a.transkript ?? '').slice(0, 20_000)}\n\nAntworten von Felix:\n${antwort}`,
    bilder: [],
  });
  const neu = sopSchema.safeParse(jsonAus(roh));
  if (!neu.success) throw new Error('Die KI konnte die Antworten nicht einarbeiten – bitte erneut versuchen.');

  const abschnitte: SopAbschnitte = { ...neu.data.abschnitte, links: neu.data.abschnitte.links.filter((l) => l.href.startsWith('/')) };
  const inhalt = sopZuMarkdown({ zusammenfassung: neu.data.zusammenfassung, abschnitte: neu.data.abschnitte });
  const positionen = neu.data.positionen.filter(istPosition);
  await svc
    .from('akademie_artikel')
    .update({
      zusammenfassung: neu.data.zusammenfassung,
      abschnitte,
      inhalt,
      positionen: positionen.length ? positionen : artikel.positionen,
      such_text: suchTextVon({ modul: artikel.modul, zusammenfassung: neu.data.zusammenfassung, abschnitte, inhalt }),
      updated_at: new Date().toISOString(),
    })
    .eq('slug', a.artikel_slug);

  const offen = new Set(neu.data.offene_fragen);
  const beantwortet = a.offene_fragen.map((f) => (f.antwort || offen.has(f.frage) ? f : { ...f, antwort: antwort.slice(0, 2000) }));
  const neueFragen = neu.data.offene_fragen.filter((f) => !a.offene_fragen.some((x) => x.frage === f)).map((frage) => ({ frage, antwort: null }));
  const offene_fragen = [...beantwortet, ...neueFragen].slice(0, 20);
  await setze(svc, id, { offene_fragen });
  return { offene_fragen };
}

/* ── Löschen ──────────────────────────────────────────────────────── */

export async function loescheAufnahme(svc: SupabaseClient, id: string): Promise<void> {
  const { data } = await svc.from('akademie_aufnahmen').select(AUFNAHME_SPALTEN).eq('id', id).maybeSingle();
  const a = data as Aufnahme | null;
  if (!a) return;
  const pfade = [...a.audio_pfade, ...a.bild_pfade, ...(a.video_pfad ? [a.video_pfad] : [])];
  if (pfade.length) await svc.storage.from(AUFNAHME_BUCKET).remove(pfade);
  if (a.video_key) {
    await svc.from('akademie_artikel').update({ video_key: null }).eq('video_key', a.video_key);
    await svc.from('akademie_videos').delete().eq('key', a.video_key);
  }
  await svc.from('akademie_aufnahmen').delete().eq('id', id);
}

/** Für den Tick: hängengebliebene oder wartende Aufnahmen (ältere als ein paar Minuten) */
export async function aufnahmenZumAnstossen(svc: SupabaseClient, jetzt = new Date()): Promise<string[]> {
  const { data } = await svc
    .from('akademie_aufnahmen')
    .select('id, status, verarbeitung_seit, versuche, updated_at')
    .in('status', ['wartet', 'transkription', 'entwurf', 'pruefung'])
    .limit(10);
  const grenzeWartet = jetzt.getTime() - 3 * 60_000;
  const zeilen = (data ?? []) as Array<Pick<Aufnahme, 'id' | 'status' | 'verarbeitung_seit' | 'versuche' | 'updated_at'>>;
  // Zu oft hängengeblieben → Fehler statt endlos „läuft“
  for (const a of zeilen) {
    const haengt = a.status !== 'wartet' && a.verarbeitung_seit && jetzt.getTime() - new Date(a.verarbeitung_seit).getTime() > HAENGT_NACH_MIN * 60_000;
    if (haengt && a.versuche >= MAX_VERSUCHE) {
      await setze(svc, a.id, { status: 'fehler', fehler: 'Verarbeitung mehrfach abgebrochen (zu lang?) – bitte „Erneut verarbeiten“ oder kürzer aufnehmen.', verarbeitung_seit: null });
    }
  }
  return zeilen
    .filter((a) => (a.status === 'wartet' ? new Date(a.updated_at).getTime() < grenzeWartet : istVerarbeitbar(a, jetzt)))
    .map((a) => a.id);
}
