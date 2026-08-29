import { SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { transcribeAudio } from '@/lib/recordings/transcribe';

interface TranscriptQuestion {
  key: string;
  frage_text: string;
  ziel_feld: string | null;
  pflicht: boolean;
  hinweis_fuer_csm: string | null;
}

interface ExtractedAnswer {
  frage_key: string;
  antwort: string;
  zitat: string;
  sicherheit: 'hoch' | 'mittel' | 'niedrig' | 'nicht_gefunden';
}

/**
 * Full transcript processing pipeline:
 * 1. Transcribe audio/video (if needed)
 * 2. Extract answers via Claude
 * 3. Create transcript_answers rows
 * 4. Create a review task for the CSM
 */
export async function processTranscript(
  supabase: SupabaseClient,
  transcriptId: string
): Promise<{ success: boolean; error?: string }> {
  // 1. Load transcript
  const { data: transcript, error: loadError } = await supabase
    .from('transcripts')
    .select('*')
    .eq('id', transcriptId)
    .single();

  if (loadError || !transcript) {
    return { success: false, error: `Transkript nicht gefunden: ${loadError?.message}` };
  }

  // 2. Transcribe if audio/video and no volltext yet
  if (
    (transcript.quelle === 'upload_audio' || transcript.quelle === 'upload_video') &&
    !transcript.volltext &&
    transcript.datei_url
  ) {
    try {
      // Download file from storage
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('transcripts')
        .download(transcript.datei_url);

      if (downloadError || !fileData) {
        await supabase
          .from('transcripts')
          .update({ status: 'hochgeladen' })
          .eq('id', transcriptId);
        return { success: false, error: `Datei-Download fehlgeschlagen: ${downloadError?.message}` };
      }

      const buffer = Buffer.from(await fileData.arrayBuffer());
      const fileName = transcript.datei_url.split('/').pop() || 'audio.mp3';
      const volltext = await transcribeAudio(buffer, fileName);

      await supabase
        .from('transcripts')
        .update({ volltext, status: 'transkribiert' })
        .eq('id', transcriptId);

      transcript.volltext = volltext;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      console.error('[processTranscript] Transkription fehlgeschlagen:', message);
      return { success: false, error: `Transkription fehlgeschlagen: ${message}` };
    }
  }

  // 3. Extract answers with Claude
  if (!transcript.volltext) {
    return { success: false, error: 'Kein Volltext vorhanden' };
  }

  try {
    // Load active questions
    const { data: questions, error: qError } = await supabase
      .from('transcript_questions')
      .select('key, frage_text, ziel_feld, pflicht, hinweis_fuer_csm')
      .eq('aktiv', true)
      .order('reihenfolge', { ascending: true });

    if (qError || !questions || questions.length === 0) {
      return { success: false, error: `Keine Fragen gefunden: ${qError?.message}` };
    }

    const answers = await extractAnswersWithClaude(
      transcript.volltext,
      questions as TranscriptQuestion[]
    );

    // 4. Insert answers
    const answerRows = answers.map((a) => {
      const question = questions.find((q: TranscriptQuestion) => q.key === a.frage_key);
      return {
        transcript_id: transcriptId,
        frage_key: a.frage_key,
        frage_text: question?.frage_text ?? a.frage_key,
        antwort: a.antwort,
        zitat: a.zitat,
        sicherheit: a.sicherheit,
        ziel_feld: question?.ziel_feld ?? null,
        status: a.sicherheit === 'hoch' ? 'bestaetigt' : 'offen',
      };
    });

    if (answerRows.length > 0) {
      const { error: insertError } = await supabase
        .from('transcript_answers')
        .insert(answerRows);

      if (insertError) {
        console.error('[processTranscript] Antworten speichern fehlgeschlagen:', insertError.message);
        return { success: false, error: `Antworten speichern fehlgeschlagen: ${insertError.message}` };
      }
    }

    // 5. Set status to 'ausgewertet'
    await supabase
      .from('transcripts')
      .update({ status: 'ausgewertet' })
      .eq('id', transcriptId);

    // 6. Create review task for CSM
    try {
      await createReviewTask(supabase, transcriptId, transcript.agency_id);
    } catch (taskErr) {
      // Non-critical — log but don't fail the pipeline
      console.error('[processTranscript] Aufgabe erstellen fehlgeschlagen:', taskErr);
    }

    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
    console.error('[processTranscript] KI-Extraktion fehlgeschlagen:', message);
    return { success: false, error: `KI-Extraktion fehlgeschlagen: ${message}` };
  }
}

/**
 * Uses Claude to extract answers from a transcript for each question.
 */
async function extractAnswersWithClaude(
  volltext: string,
  questions: TranscriptQuestion[]
): Promise<ExtractedAnswer[]> {
  const anthropic = new Anthropic();

  const questionList = questions
    .map((q, i) => `${i + 1}. key: "${q.key}" — Frage: "${q.frage_text}"`)
    .join('\n');

  const systemPrompt = `Du bist ein Experte für D2D-Vertriebs-Recruiting. Du analysierst Transkripte von Onboarding-Gesprächen mit Agenturchefs und extrahierst Antworten auf vorgegebene Fragen.

Regeln:
- Extrahiere für jede Frage die Antwort, ein direktes Zitat aus dem Text, und deine Sicherheit.
- Sicherheit: "hoch" = klar und eindeutig beantwortet, "mittel" = implizit oder teilweise beantwortet, "niedrig" = nur vage Andeutung, "nicht_gefunden" = nicht im Text.
- Wenn du keine Antwort findest, setze antwort auf "" und zitat auf "".
- Zitate müssen exakt aus dem Text kommen (Copy-Paste).
- Antworten sollen knapp und klar sein — keine ganzen Sätze wenn nicht nötig.
- Antworte NUR mit einem JSON-Array.

Ausgabeformat (JSON-Array):
[
  {
    "frage_key": "produkt",
    "antwort": "Glasfaser-Verträge für Deutsche Glasfaser",
    "zitat": "Wir verkaufen Glasfaser, hauptsächlich für Deutsche Glasfaser.",
    "sicherheit": "hoch"
  },
  ...
]`;

  const userMessage = `Hier ist das Transkript:

---
${volltext.slice(0, 30000)}
---

Extrahiere Antworten für diese Fragen:

${questionList}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock) return [];

  // Parse JSON from the response
  const jsonMatch = textBlock.text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ExtractedAnswer[];
    return parsed.filter(
      (a) =>
        a.frage_key &&
        typeof a.sicherheit === 'string' &&
        ['hoch', 'mittel', 'niedrig', 'nicht_gefunden'].includes(a.sicherheit)
    );
  } catch {
    console.error('[extractAnswersWithClaude] JSON-Parse fehlgeschlagen');
    return [];
  }
}

/**
 * Creates a project_task "Transkript prüfen" with 24h SLA for the CSM.
 */
async function createReviewTask(
  supabase: SupabaseClient,
  transcriptId: string,
  agencyId: string
): Promise<void> {
  const now = new Date();
  const faelligAm = new Date(now.getTime() + 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  // Find CSM user (employee with funktion 'csm')
  const { data: csmUser } = await supabase
    .from('users')
    .select('id')
    .eq('funktion', 'csm')
    .in('role', ['admin', 'employee'])
    .limit(1)
    .single();

  await supabase.from('project_tasks').insert({
    agency_id: agencyId,
    titel: 'Transkript prüfen',
    beschreibung: `Das Onboarding-Transkript wurde ausgewertet und muss geprüft werden. Transkript-ID: ${transcriptId}`,
    owner_user_id: csmUser?.id ?? null,
    owner_funktion: 'csm',
    status: 'offen',
    faellig_am: faelligAm,
    freigabe_noetig: false,
    reihenfolge: 0,
  });
}
