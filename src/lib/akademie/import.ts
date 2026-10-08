/**
 * Wissen einspeisen (nur Admin): Text, Datei (PDF/TXT/MD), Sprachnachricht (Whisper) oder
 * Gesprächs-Transkript (Fireflies) → Claude erzeugt strukturierte ENTWÜRFE (neu oder Ergänzung).
 * Nichts davon sehen Mitarbeiter, bevor der Inhaber freigibt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { ARTIKEL_SPALTEN, suchTextVon, type Artikel } from './daten';
import { AKADEMIE_IMPORT_MODELL, standardKi, type KiFn } from './ki';
import { POSITIONEN, istPosition } from './positionen';
import { MODULE } from './inhalte';

export type ImportArt = 'text' | 'datei' | 'audio' | 'gespraech' | 'luecke';

const MAX_QUELLE = 40_000;

export async function textAusDatei(name: string, buffer: Buffer): Promise<string> {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    return result.text ?? '';
  }
  if (['txt', 'md', 'csv'].includes(ext)) return buffer.toString('utf8');
  if (ext === 'docx' || ext === 'doc') throw new Error('Word-Dateien bitte als PDF speichern und hochladen.');
  throw new Error(`Dateityp .${ext} wird nicht unterstützt (PDF, TXT, MD).`);
}

export async function textAusAudio(name: string, buffer: Buffer): Promise<string> {
  const { transcribeAudio } = await import('@/lib/recordings/transcribe');
  return transcribeAudio(buffer, name);
}

export async function textAusGespraech(firefliesId: string): Promise<{ titel: string; text: string }> {
  const { ladeTranskript } = await import('@/lib/gespraeche/fireflies');
  const t = await ladeTranskript(firefliesId);
  if (!t?.sentences?.length) throw new Error('Transkript nicht gefunden oder leer.');
  const text = t.sentences.map((s) => `${s.speaker_name ?? 'Sprecher'}: ${s.text}`).join('\n');
  return { titel: t.title ?? 'Gespräch', text };
}

const entwurfSchema = z.object({
  entwuerfe: z
    .array(
      z.object({
        aktion: z.enum(['neu', 'ergaenzung']),
        ziel_slug: z.string().nullable().optional(),
        typ: z.enum(['sop', 'skript', 'wissen', 'faq', 'rolle']),
        titel: z.string().min(3).max(140),
        modul: z.string().max(60).optional(),
        positionen: z.array(z.string()).default([]),
        zusammenfassung: z.string().max(400).default(''),
        inhalt: z.string().min(10),
      }),
    )
    .max(8),
});

export function slugify(titel: string): string {
  return titel
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
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

export async function erzeugeEntwuerfe(
  svc: SupabaseClient,
  eingabe: { art: ImportArt; titel: string; text: string; hinweis?: string; erstelltVon: string },
  deps: { ki?: KiFn } = {},
): Promise<{ importId: string | null; slugs: string[] }> {
  const quelle = eingabe.text.trim().slice(0, MAX_QUELLE);
  if (quelle.length < 20) throw new Error('Zu wenig Text, um daraus etwas zu machen.');

  const { data: imp } = await svc
    .from('akademie_importe')
    .insert({ art: eingabe.art, titel: eingabe.titel.slice(0, 200), rohtext: eingabe.text.slice(0, 100_000), erstellt_von: eingabe.erstelltVon })
    .select('id')
    .maybeSingle();
  const importId = (imp as { id: string } | null)?.id ?? null;

  try {
    const { data: vorhanden } = await svc.from('akademie_artikel').select('slug, titel, typ, positionen').limit(500);
    const liste = ((vorhanden ?? []) as Array<{ slug: string; titel: string; typ: string; positionen: string[] }>)
      .map((a) => `${a.slug} | ${a.titel} | ${a.typ} | ${a.positionen.join(',')}`)
      .join('\n');

    const antwort = await (deps.ki ?? standardKi)({
      model: AKADEMIE_IMPORT_MODELL,
      maxTokens: 6000,
      system: [
        'Du baust die interne Wissensdatenbank (Team-Akademie) einer Recruiting-Agentur auf.',
        'Aus dem Quelltext des Inhabers erzeugst du strukturierte Artikel-Entwürfe für Mitarbeiter.',
        'Regeln:',
        '- Nur Inhalte aus der Quelle. Nichts erfinden. Was fehlt, als Zeile „> **Felix ergänzt:** <Leitfrage>“.',
        '- Deutsch, du-Form, knapp, praxisnah. Inhalt als Markdown (Überschriften ##, Listen, nummerierte Schritte).',
        '- Gehört der Inhalt zu einem bestehenden Artikel, nutze aktion "ergaenzung" mit ziel_slug aus der Liste; sonst "neu".',
        '- typ: sop (Arbeitsschritte), skript (Gesprächsleitfaden), wissen (Hintergrund), faq (Frage/Antwort), rolle (Rollenbeschreibung).',
        `- positionen nur aus: ${POSITIONEN.map((p) => p.id).join(', ')}.`,
        `- modul möglichst aus: ${MODULE.join(', ')}.`,
        '- Antworte ausschließlich mit JSON: {"entwuerfe":[{"aktion","ziel_slug","typ","titel","modul","positionen","zusammenfassung","inhalt"}]} (höchstens 8).',
      ].join('\n'),
      prompt: [
        `Bestehende Artikel (slug | titel | typ | positionen):\n${liste || '–'}`,
        eingabe.hinweis ? `Hinweis des Inhabers: ${eingabe.hinweis}` : '',
        `Quelle (${eingabe.art}): ${eingabe.titel}\n\n${quelle}`,
      ]
        .filter(Boolean)
        .join('\n\n'),
    });

    const parsed = entwurfSchema.safeParse(jsonAus(antwort));
    if (!parsed.success) throw new Error('Die KI hat keine verwertbaren Entwürfe geliefert.');

    const vorhandeneSlugs = new Set(((vorhanden ?? []) as Array<{ slug: string }>).map((a) => a.slug));
    const zeilen = parsed.data.entwuerfe.map((e, i) => {
      const ergaenzt = e.aktion === 'ergaenzung' && e.ziel_slug && vorhandeneSlugs.has(e.ziel_slug) ? e.ziel_slug : null;
      const basis = slugify(e.titel) || 'entwurf';
      const slug = `${basis}-${Date.now().toString(36)}${i}`;
      const positionen = e.positionen.filter(istPosition);
      const modul = e.modul && e.modul.trim() ? e.modul.trim() : 'Wissen';
      return {
        slug,
        typ: e.typ,
        titel: ergaenzt ? `Ergänzung: ${e.titel}` : e.titel,
        modul,
        positionen: positionen.length ? positionen : ['grundlagen'],
        step_keys: [],
        status: 'entwurf',
        quelle: `Import (${eingabe.art}): ${eingabe.titel}`.slice(0, 300),
        zusammenfassung: e.zusammenfassung,
        abschnitte: {},
        inhalt: e.inhalt,
        ergaenzt_slug: ergaenzt,
        such_text: suchTextVon({ modul, zusammenfassung: e.zusammenfassung, abschnitte: {}, inhalt: e.inhalt }),
      };
    });

    const { error } = await svc.from('akademie_artikel').insert(zeilen);
    if (error) throw new Error(error.message);
    const slugs = zeilen.map((z) => z.slug);
    if (importId) await svc.from('akademie_importe').update({ status: 'verarbeitet', entwuerfe: slugs }).eq('id', importId);
    return { importId, slugs };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (importId) await svc.from('akademie_importe').update({ status: 'fehler', fehler: msg.slice(0, 500) }).eq('id', importId);
    throw err;
  }
}

/** Ergänzungs-Entwurf in den Ziel-Artikel übernehmen (Text anhängen) und den Entwurf löschen */
export async function uebernehmeErgaenzung(svc: SupabaseClient, slug: string, userId: string): Promise<string> {
  const { data } = await svc.from('akademie_artikel').select(ARTIKEL_SPALTEN).eq('slug', slug).maybeSingle();
  const entwurf = data as Artikel | null;
  if (!entwurf?.ergaenzt_slug) throw new Error('Kein Ergänzungs-Entwurf.');
  const { data: zielRoh } = await svc.from('akademie_artikel').select(ARTIKEL_SPALTEN).eq('slug', entwurf.ergaenzt_slug).maybeSingle();
  const ziel = zielRoh as Artikel | null;
  if (!ziel) throw new Error('Ziel-Artikel existiert nicht mehr.');
  const inhalt = [ziel.inhalt?.trim(), `## Ergänzung (${new Date().toLocaleDateString('de-DE')})`, entwurf.inhalt?.trim()].filter(Boolean).join('\n\n');
  const { error } = await svc
    .from('akademie_artikel')
    .update({ inhalt, such_text: suchTextVon({ ...ziel, inhalt }), bearbeitet_von: userId, bearbeitet_am: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('slug', ziel.slug);
  if (error) throw new Error(error.message);
  await svc.from('akademie_artikel').delete().eq('slug', slug);
  return ziel.slug;
}
