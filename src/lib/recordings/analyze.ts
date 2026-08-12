import Anthropic from '@anthropic-ai/sdk';
import type { CallRecordingAnalysis } from '@/lib/types/database';

const EMPTY_ANALYSIS: CallRecordingAnalysis = {
  script_adherence_score: 0,
  conversation_quality_score: 0,
  overall_score: 0,
  strengths: [],
  improvements: [],
  key_moments: [],
  summary: 'Analyse konnte nicht durchgeführt werden.',
};

export async function analyzeCallRecording(
  transcript: string,
  phoneScript: string | null,
  recordingType: string
): Promise<CallRecordingAnalysis> {
  if (!transcript || transcript.length < 50) return EMPTY_ANALYSIS;

  try {
    const anthropic = new Anthropic();

    const typeLabel: Record<string, string> = {
      erstgespraech: 'Erstgespräch / Kaltakquise-Anruf',
      vorstellungsgespraech: 'Vorstellungsgespräch',
      follow_up: 'Follow-Up Gespräch',
      sonstiges: 'Sonstiges Gespräch',
    };

    const scriptContext = phoneScript
      ? `\n\nHier ist das vorgegebene Telefonskript, mit dem der Anrufer arbeiten sollte:\n\n${phoneScript}\n\nBewerte wie nah der Anrufer am Skript geblieben ist (Skript-Treue).`
      : '\n\nEs gibt kein vorgegebenes Skript. Bewerte die Skript-Treue mit 0 und fokussiere auf die Gesprächsqualität.';

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1500,
      system: `Du bist ein Experte für D2D-Recruiting-Telefonate. Du analysierst Gesprächstranskripte und bewertest die Qualität.

Gesprächstyp: ${typeLabel[recordingType] || recordingType}
${scriptContext}

Antworte NUR mit einem JSON-Objekt in diesem Format:
{
  "script_adherence_score": <0-100, wie nah am Skript>,
  "conversation_quality_score": <0-100, Gesprächsführung, Tonalität, Einwandbehandlung>,
  "overall_score": <0-100, Gesamtbewertung>,
  "strengths": ["Stärke 1", "Stärke 2", ...],
  "improvements": ["Verbesserung 1", "Verbesserung 2", ...],
  "key_moments": [{"timestamp": "ca. Minute X", "note": "Beschreibung"}],
  "summary": "2-3 Sätze Gesamtbewertung"
}

Bewertungskriterien:
- Begrüßung: Freundlich, professionell, Firmenname genannt?
- Gesprächsführung: Fragen statt Monolog? Aktives Zuhören?
- Einwandbehandlung: Wie wurden Einwände behandelt?
- Abschluss: Klarer Call-to-Action (Termin, nächster Schritt)?
- Tonalität: Motivierend aber nicht aufdringlich?
- Skript-Treue: Wurden die Kernpunkte des Skripts abgedeckt?`,
      messages: [{ role: 'user', content: transcript.slice(0, 8000) }],
    });

    const textBlock = response.content.find(b => b.type === 'text');
    if (!textBlock) return EMPTY_ANALYSIS;

    const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return EMPTY_ANALYSIS;

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      script_adherence_score: parsed.script_adherence_score ?? 0,
      conversation_quality_score: parsed.conversation_quality_score ?? 0,
      overall_score: parsed.overall_score ?? 0,
      strengths: parsed.strengths ?? [],
      improvements: parsed.improvements ?? [],
      key_moments: parsed.key_moments ?? [],
      summary: parsed.summary ?? '',
    };
  } catch {
    return EMPTY_ANALYSIS;
  }
}
