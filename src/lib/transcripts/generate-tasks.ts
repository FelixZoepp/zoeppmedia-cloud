import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

interface GeneratedTask {
  titel: string;
  beschreibung: string;
  prioritaet: number; // 1 = zuerst
}

/**
 * Erzeugt aus den bestätigten Transkript-Antworten konkrete Setup-Aufgaben
 * (project_tasks) für den Kickoff. Dedupe über notiz-Marker "transkript:<id>".
 * Aufgaben werden zum Review vorgelegt (Status 'offen', fällig vor dem Kickoff).
 */
export async function generateTasksFromTranscript(
  supabase: SupabaseClient,
  transcriptId: string
): Promise<number> {
  const { data: transcript } = await supabase
    .from('transcripts')
    .select('id, agency_id, typ')
    .eq('id', transcriptId)
    .single();

  if (!transcript) return 0;

  // Dedupe: schon generiert?
  const marker = `transkript:${transcriptId}`;
  const { data: existing } = await supabase
    .from('project_tasks')
    .select('id')
    .eq('agency_id', transcript.agency_id)
    .eq('notiz', marker)
    .limit(1);
  if (existing?.length) return 0;

  // Bestätigte/korrigierte Antworten laden
  const { data: answers } = await supabase
    .from('transcript_answers')
    .select('frage_text, antwort, korrigierter_wert, status')
    .eq('transcript_id', transcriptId)
    .in('status', ['bestaetigt', 'korrigiert']);

  if (!answers?.length) return 0;

  const antwortenText = answers
    .map((a) => `- ${a.frage_text}: ${a.korrigierter_wert || a.antwort}`)
    .join('\n');

  const tasks = await deriveTasksWithClaude(antwortenText);
  if (!tasks.length) return 0;

  // CSM als Default-Owner
  const { data: csmUser } = await supabase
    .from('users')
    .select('id')
    .eq('funktion', 'csm')
    .in('role', ['admin', 'employee'])
    .limit(1)
    .maybeSingle();

  // Fällig in 3 Tagen (vor dem Kickoff Tag 5-7)
  const faelligAm = new Date(Date.now() + 3 * 86400000).toISOString();

  const rows = tasks.slice(0, 10).map((t, i) => ({
    agency_id: transcript.agency_id,
    titel: t.titel.slice(0, 200),
    beschreibung: t.beschreibung,
    owner_user_id: csmUser?.id ?? null,
    owner_funktion: 'csm',
    status: 'offen',
    faellig_am: faelligAm,
    freigabe_noetig: false,
    reihenfolge: t.prioritaet ?? i + 1,
    notiz: marker,
  }));

  const { error } = await supabase.from('project_tasks').insert(rows);
  return error ? 0 : rows.length;
}

async function deriveTasksWithClaude(antwortenText: string): Promise<GeneratedTask[]> {
  const anthropic = new Anthropic();

  const systemPrompt = `Du bist Fulfillment-Leiter einer Recruiting-Agentur für D2D-Vertriebsteams. Aus den Antworten eines Onboarding-Gesprächs mit einem neuen Kunden leitest du konkrete Setup-Aufgaben für das interne Team ab, die VOR dem Kickoff-Call erledigt sein müssen.

Regeln:
- Nur Aufgaben, die sich direkt aus den Antworten ergeben (z.B. Funnel-Texte an Produkt anpassen, Zielregion in Ads einstellen, CRM-Phasen anpassen, Sonderwünsche umsetzen).
- Keine Standard-Aufgaben, die sowieso immer laufen (Funnel bauen, Ads schalten, Onboarding).
- 3 bis 8 Aufgaben. Kurze, umsetzbare Titel. Beschreibung mit dem konkreten Detail aus der Antwort.
- prioritaet: 1 = wichtigste zuerst.
- Antworte NUR mit einem JSON-Array.

Format:
[{"titel": "...", "beschreibung": "...", "prioritaet": 1}]`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: `Antworten aus dem Onboarding-Gespräch:\n\n${antwortenText}\n\nLeite die Setup-Aufgaben ab.`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) return [];

  const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as GeneratedTask[];
    return parsed.filter((t) => t.titel && t.beschreibung);
  } catch {
    return [];
  }
}
