/**
 * Akademie-Bot: beantwortet Mitarbeiterfragen NUR aus freigegebenen, für den Nutzer freigeschalteten
 * Artikeln (Volltextsuche), zitiert die Quellen und meldet unbeantwortbare Fragen als Wissenslücke.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { sucheArtikel, suchTextVon, type Artikel } from './daten';
import { AKADEMIE_BOT_MODELL, standardKi, type KiFn } from './ki';
import { ladeZugriff, type AkademieNutzer, type Zugriff } from './zugriff';

const KEINE = 'KEINE_ANLEITUNG';
export const LUECKEN_ANTWORT =
  'Dazu gibt es in der Akademie noch keine Anleitung. Ich habe die Frage an Felix weitergegeben – bis dahin frag bitte direkt im Team nach.';

export interface BotAntwort {
  id: string | null;
  antwort: string;
  quellen: Array<{ slug: string; titel: string }>;
  luecke: boolean;
}

export function normalisiereFrage(frage: string): string {
  return frage
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** Frage als Wissenslücke merken (gleiche Frage zählt hoch) */
export async function merkeLuecke(svc: SupabaseClient, frage: string, positionen: string[]): Promise<void> {
  const norm = normalisiereFrage(frage);
  if (!norm) return;
  const { data } = await svc.from('akademie_luecken').select('id, anzahl, status').eq('frage_norm', norm).maybeSingle();
  const alt = data as { id: string; anzahl: number; status: string } | null;
  if (alt) {
    await svc
      .from('akademie_luecken')
      .update({ anzahl: alt.anzahl + 1, zuletzt_am: new Date().toISOString(), ...(alt.status === 'erledigt' ? { status: 'offen' } : {}) })
      .eq('id', alt.id);
    return;
  }
  const { error } = await svc.from('akademie_luecken').insert({ frage: frage.slice(0, 500), frage_norm: norm, positionen, anzahl: 1, status: 'offen' });
  if (error && error.code !== '23505') console.error('[akademie] Lücke', error.message);
}

/** Kompakter Kontext je Quelle – Kosten im Blick */
export function kontextVon(treffer: Artikel[], maxJe = 1600): string {
  return treffer
    .map((a, i) => `[${i + 1}] ${a.titel} (${a.typ})\n${suchTextVon(a).slice(0, maxJe)}`)
    .join('\n\n---\n\n');
}

export async function beantworteFrage(
  svc: SupabaseClient,
  nutzer: AkademieNutzer,
  frage: string,
  deps: { ki?: KiFn; zugriff?: Zugriff } = {},
): Promise<BotAntwort> {
  const f = frage.trim().slice(0, 600);
  const z = deps.zugriff ?? (await ladeZugriff(svc, nutzer));
  const treffer = await sucheArtikel(svc, z, f, 4);
  const positionen = z.admin ? [] : [...z.positionen];

  let antwort = LUECKEN_ANTWORT;
  let quellen: Array<{ slug: string; titel: string }> = [];
  let luecke = treffer.length === 0;

  if (!luecke) {
    const text = await (deps.ki ?? standardKi)({
      model: AKADEMIE_BOT_MODELL,
      maxTokens: 600,
      system: [
        'Du bist der Akademie-Bot der Zoepp Media Cloud und beantwortest Fragen von Mitarbeitern.',
        'Antworte NUR mit Informationen aus den Quellen unten. Ergänze nichts aus eigenem Wissen.',
        `Wenn die Quellen die Frage nicht beantworten, antworte exakt mit ${KEINE}.`,
        'Antworte kurz auf Deutsch in der Du-Form, gern als nummerierte Schritte, und belege Aussagen mit [1], [2] usw.',
        'Platzhalter wie „Felix ergänzt“ sind keine Antwort – dann gilt die Frage als offen.',
      ].join('\n'),
      prompt: `Quellen:\n\n${kontextVon(treffer)}\n\nFrage: ${f}`,
    });
    if (!text.trim() || text.includes(KEINE)) {
      luecke = true;
    } else {
      antwort = text.trim();
      const genannt = new Set([...antwort.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1]) - 1));
      const auswahl = genannt.size ? treffer.filter((_, i) => genannt.has(i)) : treffer;
      quellen = auswahl.map((a) => ({ slug: a.slug, titel: a.titel }));
    }
  }

  if (luecke) await merkeLuecke(svc, f, positionen);

  const { data } = await svc
    .from('akademie_bot_antworten')
    .insert({ user_id: nutzer.id, frage: f, antwort, quellen: quellen.map((q) => q.slug), luecke })
    .select('id')
    .maybeSingle();
  return { id: (data as { id: string } | null)?.id ?? null, antwort, quellen, luecke };
}
