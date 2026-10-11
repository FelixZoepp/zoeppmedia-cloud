/**
 * Standard-KI-Agent für alle Kunden (Vertrieb/Außendienst, D2D): kurze Vorqualifizierung per WhatsApp,
 * am Ende die Frage nach der Erreichbarkeit → Rückruf durch den Innendienst (kein Terminlink).
 * stelleAgentSicher() legt ihn für Stellen ohne Agent an und ergänzt bei bestehenden Agenten die Rückruf-Frage.
 * Wird beim Verbinden der WhatsApp-Nummer und beim Kunden-Setup aufgerufen; schreibt niemanden an.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { RUECKRUF_FRAGE, RUECKRUF_KEY } from './rueckruf';

export const ZOEPP_AGENT = {
  persona: 'Lea, digitale Recruiting-Assistentin',
  tone: 'freundlich, locker, motivierend, auf Augenhöhe – kurze Sätze wie im WhatsApp-Chat',
  formality: 'du' as const,
  intro_text:
    'Hi, ich bin Lea, die digitale Assistentin des Teams. Ich stelle dir kurz ein paar Fragen zu deiner Bewerbung, das dauert etwa 2 Minuten. Danach ruft dich jemand aus dem Team für ein kurzes Kennenlernen an.',
  faq: [
    { q: 'Wie geht es nach den Fragen weiter?', a: 'Danach ruft dich jemand aus dem Team kurz an (ca. 5 Minuten). In dem Gespräch klären wir offene Fragen und machen direkt einen Termin fürs Kennenlernen aus.' },
    { q: 'Brauche ich Vertriebserfahrung?', a: 'Nein. Viele unserer besten Leute sind Quereinsteiger. Wichtig sind Motivation, Zuverlässigkeit und Spaß am Umgang mit Menschen – alles andere lernst du in der Einarbeitung.' },
    { q: 'Was verdiene ich?', a: 'Das hängt vom Modell und deiner Leistung ab. Die genauen Zahlen bespricht das Team mit dir im kurzen Anruf – da bekommst du ein ehrliches Bild.' },
    { q: 'Mit wem schreibe ich gerade?', a: 'Mit Lea, der digitalen Assistentin des Teams. Wenn du lieber direkt mit einem Menschen sprechen möchtest, sag einfach Bescheid.' },
  ],
  max_turns: 24,
  scoring_rules: { a_min: 70, b_min: 45 },
};

export const ZOEPP_FRAGEN: Array<{ key: string; text: string; type: 'text' | 'number' | 'choice' | 'yes_no' | 'date'; options?: string[]; required: boolean; knockout_rule?: Record<string, unknown>; weight: number }> = [
  { key: 'aussendienst_ok', text: 'Kannst du dir vorstellen, im Außendienst direkt beim Kunden zu arbeiten – auch an der Haustür?', type: 'yes_no', required: true, weight: 3 },
  { key: 'wohnort', text: 'In welcher Stadt oder Region wohnst du?', type: 'text', required: true, weight: 1 },
  { key: 'fuehrerschein', text: 'Hast du einen Führerschein Klasse B?', type: 'yes_no', required: true, weight: 1 },
  { key: 'starttermin', text: 'Ab wann könntest du starten?', type: 'date', required: true, weight: 2 },
  { key: 'arbeitsmodell', text: 'Suchst du Vollzeit, Teilzeit oder etwas nebenberuflich?', type: 'choice', options: ['Vollzeit', 'Teilzeit', 'Nebenberuflich'], required: true, weight: 1 },
  { key: 'vertriebserfahrung', text: 'Hast du schon im Vertrieb oder mit Kunden gearbeitet? Wenn ja, wie lange ungefähr?', type: 'text', required: false, weight: 1 },
  { key: RUECKRUF_KEY, text: RUECKRUF_FRAGE, type: 'text', required: true, weight: 0 },
];

async function fragenAnlegen(svc: SupabaseClient, agencyId: string, configId: string, ab: number, fragen: typeof ZOEPP_FRAGEN): Promise<string | null> {
  const { error } = await svc.from('bot_questions').insert(
    fragen.map((q, i) => ({
      agency_id: agencyId,
      bot_config_id: configId,
      position: ab + i,
      key: q.key,
      text: q.text,
      type: q.type,
      options: q.options ?? null,
      required: q.required,
      knockout_rule: q.knockout_rule ?? null,
      weight: q.weight,
    })),
  );
  return error?.message ?? null;
}

/** Jede aktive Stelle des Kunden bekommt einen aktiven Agenten mit Rückruf-Frage (idempotent) */
export async function stelleAgentSicher(svc: SupabaseClient, agencyId: string): Promise<{ angelegt: number; ergaenzt: number; hinweise: string[] }> {
  const hinweise: string[] = [];
  let angelegt = 0;
  let ergaenzt = 0;
  const { data: jobs } = await svc.from('jobs').select('id, bot_config_id, status').eq('agency_id', agencyId).in('status', ['active', 'paused']);
  for (const j of (jobs ?? []) as Array<{ id: string; bot_config_id: string | null }>) {
    if (!j.bot_config_id) {
      const { data: cfg, error } = await svc
        .from('bot_configs')
        .insert({
          agency_id: agencyId,
          persona: ZOEPP_AGENT.persona,
          tone: ZOEPP_AGENT.tone,
          formality: ZOEPP_AGENT.formality,
          intro_text: ZOEPP_AGENT.intro_text,
          faq: ZOEPP_AGENT.faq,
          language: 'de',
          allowed_languages: ['de', 'en', 'tr', 'ar', 'ru', 'pl'],
          max_turns: ZOEPP_AGENT.max_turns,
          handover_rules: {},
          scoring_rules: ZOEPP_AGENT.scoring_rules,
          active: true,
        })
        .select('id')
        .single();
      if (error || !cfg) {
        hinweise.push(`Agent für Stelle ${j.id} nicht angelegt: ${error?.message ?? ''}`);
        continue;
      }
      const id = (cfg as { id: string }).id;
      const f = await fragenAnlegen(svc, agencyId, id, 0, ZOEPP_FRAGEN);
      if (f) {
        // Ohne Fragen würde der Agent sofort „fertig“ melden → wieder entfernen
        await svc.from('bot_configs').delete().eq('id', id);
        hinweise.push(`Fragen für Stelle ${j.id} nicht angelegt: ${f}`);
        continue;
      }
      await svc.from('jobs').update({ bot_config_id: id }).eq('id', j.id).eq('agency_id', agencyId);
      angelegt++;
      continue;
    }
    // Bestehender Agent: Rückruf-Frage ergänzen, falls sie fehlt
    const { data: qs } = await svc.from('bot_questions').select('key, position').eq('bot_config_id', j.bot_config_id);
    const liste = (qs ?? []) as Array<{ key: string; position: number }>;
    if (!liste.length) {
      const f = await fragenAnlegen(svc, agencyId, j.bot_config_id, 0, ZOEPP_FRAGEN);
      if (f) hinweise.push(`Fragen für Stelle ${j.id} nicht angelegt: ${f}`);
      else ergaenzt++;
    } else if (!liste.some((q) => q.key === RUECKRUF_KEY)) {
      const f = await fragenAnlegen(svc, agencyId, j.bot_config_id, Math.max(...liste.map((q) => q.position)) + 1, ZOEPP_FRAGEN.filter((q) => q.key === RUECKRUF_KEY));
      if (f) hinweise.push(`Rückruf-Frage für Stelle ${j.id} nicht ergänzt: ${f}`);
      else ergaenzt++;
    }
  }
  return { angelegt, ergaenzt, hinweise };
}
