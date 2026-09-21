/**
 * POST /api/bot/simulate
 *
 * Testmodus-API für den KI-Vorqualifizierungsbot.
 * Phase 3 Task 10.
 *
 * Läuft OHNE DB-Schreibzugriffe auf conversations/messages/application_answers.
 * ai_calls-Log mit purpose 'simulate', conversation_id null, ist erlaubt.
 *
 * Body:
 *   job_id:    string
 *   history:   Array<{ role: 'candidate' | 'bot'; text: string }>
 *   collected: Array<{ question_key: string; value: unknown }>
 *
 * Response:
 *   { reply: string; output: DialogOutput; collected: Array<{ question_key, value }>; done: boolean; score?: ScoreResult }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { llmJsonCall, DIALOG_MODEL } from '@/lib/ai/llm-client';
import { dialogOutputSchema } from '@/lib/bot/schema';
import { buildSystemBlocks } from '@/lib/bot/prompt';
import { computeScore } from '@/lib/bot/scoring';
import { PROMPT_VERSION } from '@/lib/bot/prompt';
import type { BotConfig, BotQuestion } from '@/lib/types/database';

// ---------------------------------------------------------------------------
// Request-Schema
// ---------------------------------------------------------------------------

const historyItemSchema = z.object({
  role: z.enum(['candidate', 'bot']),
  text: z.string(),
});

const collectedItemSchema = z.object({
  question_key: z.string(),
  value: z.unknown(),
});

const requestBodySchema = z.object({
  job_id:    z.string().min(1),
  history:   z.array(historyItemSchema),
  collected: z.array(collectedItemSchema),
});

// ---------------------------------------------------------------------------
// POST Handler
// ---------------------------------------------------------------------------

export async function POST(request: NextRequest): Promise<NextResponse> {
  // --- Auth ---
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  if (!canWriteRole(user.role)) {
    return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });
  }

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  }

  // --- Body parsen ---
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const parseResult = requestBodySchema.safeParse(raw);
  if (!parseResult.success) {
    return NextResponse.json(
      { error: parseResult.error.issues[0]?.message ?? 'Ungültige Eingabe' },
      { status: 400 }
    );
  }

  const { job_id: jobId, history, collected } = parseResult.data;

  const svc = createAdminClient();

  // --- Job laden (agency-scoped) ---
  const { data: job } = await svc
    .from('jobs')
    .select('id, agency_id, title, description, location, bot_config_id')
    .eq('id', jobId)
    .eq('agency_id', agencyId)
    .single();

  if (!job) {
    return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });
  }

  // --- Kein Bot konfiguriert (config: null blockt) ---
  if (!job.bot_config_id) {
    return NextResponse.json({ error: 'Kein Bot konfiguriert' }, { status: 400 });
  }

  // --- Config laden (agency-scoped) ---
  const { data: config } = await svc
    .from('bot_configs')
    .select('*')
    .eq('id', job.bot_config_id)
    .eq('agency_id', agencyId)
    .single();

  if (!config) {
    return NextResponse.json({ error: 'Kein Bot konfiguriert' }, { status: 400 });
  }

  // --- Fragen laden (agency-scoped, geordnet nach position) ---
  const { data: rawQuestions } = await svc
    .from('bot_questions')
    .select('*')
    .eq('bot_config_id', job.bot_config_id)
    .eq('agency_id', agencyId)
    .order('position', { ascending: true });

  const questions: BotQuestion[] = (rawQuestions ?? []) as BotQuestion[];

  // --- Agenturname laden (für Systemprompt) ---
  const { data: agency } = await svc
    .from('agencies')
    .select('id, name')
    .eq('id', agencyId)
    .single();

  const agencyName = (agency as { name?: string } | null)?.name ?? 'Ihre Agentur';

  // --- Collected-Map aufbauen (bereits gesammelte Antworten) ---
  const collectedMap = new Map<string, unknown>(
    collected.map(c => [c.question_key, c.value])
  );

  // --- Beantwortet-Status für Systemprompt bestimmen ---
  const questionsWithStatus = questions.map(q => ({
    ...q,
    status: (
      collectedMap.has(q.key) ? 'beantwortet' : 'offen'
    ) as 'offen' | 'beantwortet' | 'übersprungen',
  }));

  // Erste unbeantwortete required-Frage = aktuelle Frage
  const currentQuestionKey =
    questionsWithStatus.find(q => q.status === 'offen' && q.required)?.key ??
    questionsWithStatus.find(q => q.status === 'offen')?.key ??
    null;

  // --- Systemprompt bauen ---
  const botConfig = config as BotConfig;
  const systemBlocks = buildSystemBlocks({
    agencyName,
    job: {
      title:       (job as { title: string }).title,
      description: (job as { description: string | null }).description,
      location:    (job as { location: string | null }).location,
    },
    config: botConfig,
    questions: questionsWithStatus,
    currentQuestionKey,
  });

  // --- Messages aus history bauen ---
  const messages = history.map(h => ({
    role:    h.role === 'candidate' ? ('user' as const) : ('assistant' as const),
    content: h.text,
  }));

  // Falls keine history → Greeting-Prompt einsetzen
  if (messages.length === 0) {
    messages.push({
      role:    'user',
      content: botConfig.intro_text ?? 'Hallo, ich möchte mich bewerben.',
    });
  }

  // --- LLM-Aufruf (purpose 'simulate', conversationId null) ---
  let output;
  try {
    output = await llmJsonCall(svc, {
      agencyId,
      conversationId: null,
      purpose:        'simulate',
      model:          DIALOG_MODEL,
      promptVersion:  PROMPT_VERSION,
      system:         systemBlocks,
      messages,
      maxTokens:      512,
      schema:         dialogOutputSchema,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'KI-Fehler';
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // --- collected aktualisieren (neue Antworten aus output.answers mergen) ---
  const updatedCollected = [...collected];
  for (const answer of output.answers) {
    const existing = updatedCollected.findIndex(c => c.question_key === answer.question_key);
    if (existing >= 0) {
      updatedCollected[existing] = { question_key: answer.question_key, value: answer.value };
    } else {
      updatedCollected.push({ question_key: answer.question_key, value: answer.value });
    }
  }

  // --- done: true wenn alle required-Fragen in collected ---
  const updatedMap = new Map<string, unknown>(
    updatedCollected.map(c => [c.question_key, c.value])
  );
  const requiredKeys = questions.filter(q => q.required).map(q => q.key);
  const done = requiredKeys.every(k => updatedMap.has(k));

  // --- Score berechnen wenn done ---
  let score;
  if (done) {
    score = computeScore(
      questions,
      updatedCollected.map(c => ({ question_key: c.question_key, value: c.value })),
      botConfig.scoring_rules,
    );
  }

  return NextResponse.json({
    reply:     output.reply_text,
    output,
    collected: updatedCollected,
    done,
    ...(score !== undefined && { score }),
  });
}
