/**
 * GET  /api/jobs/[id]/bot  → { config: BotConfig | null, questions: BotQuestion[], presets: Array<{ key, name }> }
 * PUT  /api/jobs/[id]/bot  → { ok: true, config_id: string }
 *
 * Phase 3 Task 9 — Bot-Config-API mit Preset-Anwendung und Guardrail-Validierung
 *
 * Ruling P3-R2: jobs.bot_config_id → bot_configs (KEIN job_id auf bot_configs).
 * Ruling P3-R10: Fragen dürfen keine verbotenen Themen berühren (violatesForbiddenTopics).
 * Multi-Tenant: Jede Query auf agentur-gefilterte Tabellen trägt .eq('agency_id', agencyId).
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { BOT_PRESETS } from '@/lib/bot/presets';
import { violatesForbiddenTopics } from '@/lib/bot/schema';

// ---------------------------------------------------------------------------
// Zod-Schema für den PUT-Body
// ---------------------------------------------------------------------------

const questionTypeSchema = z.enum(['text', 'number', 'choice', 'yes_no', 'date']);

const questionInputSchema = z.object({
  id:            z.string().optional(),
  key:           z.string().min(1),
  text:          z.string().min(1),
  type:          questionTypeSchema,
  options:       z.array(z.string()).nullable().optional(),
  required:      z.boolean(),
  knockout_rule: z.record(z.string(), z.unknown()).nullable().optional(),
  weight:        z.number().int().min(0),
});

const configInputSchema = z.object({
  persona:       z.string().min(1),
  tone:          z.string().min(1),
  formality:     z.enum(['du', 'sie']),
  language:      z.string().min(1),
  intro_text:    z.string().nullable().optional(),
  faq:           z.array(z.object({ q: z.string(), a: z.string() })),
  max_turns:     z.number().int().min(5).max(50),
  scoring_rules: z.object({ a_min: z.number(), b_min: z.number() }),
  active:        z.boolean(),
});

const putBodySchema = z.object({
  preset_key: z.string().optional(),
  config:     configInputSchema,
  questions:  z.array(questionInputSchema),
});

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  // --- Auth ---
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const svc = createAdminClient();

  // --- Job laden (agency-scoped) ---
  const { data: job } = await svc
    .from('jobs')
    .select('id, bot_config_id')
    .eq('id', jobId)
    .eq('agency_id', agencyId)
    .single();

  if (!job) return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });

  // --- Presets-Liste (immer zurückgeben) ---
  const presets = BOT_PRESETS.map(p => ({ key: p.key, name: p.name }));

  // --- Kein Config verknüpft ---
  if (!job.bot_config_id) {
    return NextResponse.json({ config: null, questions: [], presets });
  }

  // --- Config laden (agency-scoped) ---
  const { data: config } = await svc
    .from('bot_configs')
    .select('*')
    .eq('id', job.bot_config_id)
    .eq('agency_id', agencyId)
    .single();

  if (!config) {
    // Config-Verknüpfung verwaist — als nicht vorhanden behandeln
    return NextResponse.json({ config: null, questions: [], presets });
  }

  // --- Fragen laden (agency-scoped, geordnet nach position) ---
  const { data: questions } = await svc
    .from('bot_questions')
    .select('*')
    .eq('bot_config_id', job.bot_config_id)
    .eq('agency_id', agencyId)
    .order('position', { ascending: true });

  return NextResponse.json({ config, questions: questions ?? [], presets });
}

// ---------------------------------------------------------------------------
// PUT
// ---------------------------------------------------------------------------

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: jobId } = await params;

  // --- Auth ---
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  // --- Body parsen ---
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const svc = createAdminClient();

  // --- Job laden (agency-scoped) ---
  const { data: job } = await svc
    .from('jobs')
    .select('id, bot_config_id')
    .eq('id', jobId)
    .eq('agency_id', agencyId)
    .single();

  if (!job) return NextResponse.json({ error: 'Job nicht gefunden' }, { status: 404 });

  // --- Zod-Parsing ---
  const parseResult = putBodySchema.safeParse(raw);
  if (!parseResult.success) {
    return NextResponse.json({ error: parseResult.error.issues[0]?.message ?? 'Ungültige Eingabe' }, { status: 400 });
  }

  const body = parseResult.data;

  // --- Scoring-Regel: a_min muss über b_min liegen ---
  if (body.config.scoring_rules.a_min <= body.config.scoring_rules.b_min) {
    return NextResponse.json({ error: 'A-Schwelle muss über B-Schwelle liegen' }, { status: 400 });
  }

  // --- Preset-Anwendung: wenn preset_key gesetzt, Fragen aus Preset übernehmen ---
  let finalQuestions = body.questions;
  if (body.preset_key) {
    const preset = BOT_PRESETS.find(p => p.key === body.preset_key);
    if (preset) {
      finalQuestions = preset.questions.map(q => ({
        key:           q.key,
        text:          q.text,
        type:          q.type,
        options:       q.options ?? null,
        required:      q.required,
        knockout_rule: q.knockout_rule ?? null,
        weight:        q.weight,
      }));
    }
  }

  // --- Frage-Validierungen ---

  // Doppelte Keys
  const keys = finalQuestions.map(q => q.key);
  const uniqueKeys = new Set(keys);
  if (uniqueKeys.size !== keys.length) {
    return NextResponse.json({ error: 'Frage-Keys müssen eindeutig sein' }, { status: 400 });
  }

  // choice-Frage benötigt options
  for (const q of finalQuestions) {
    if (q.type === 'choice' && (!q.options || q.options.length === 0)) {
      return NextResponse.json({ error: `Frage "${q.key}": choice-Typ erfordert mindestens eine Option` }, { status: 400 });
    }
  }

  // P3-R10: Verbotene Themen in key oder text
  for (const q of finalQuestions) {
    if (violatesForbiddenTopics(q.key) || violatesForbiddenTopics(q.text)) {
      return NextResponse.json({ error: 'Frage berührt ein verbotenes Thema' }, { status: 400 });
    }
  }

  // ---------------------------------------------------------------------------
  // Persistieren: Config upsert + Fragen vollständig ersetzen
  // ---------------------------------------------------------------------------

  let configId = job.bot_config_id as string | null;

  if (configId) {
    // Bestehenden Config aktualisieren (agency-scoped)
    await svc
      .from('bot_configs')
      .update({
        persona:       body.config.persona,
        tone:          body.config.tone,
        formality:     body.config.formality,
        language:      body.config.language,
        intro_text:    body.config.intro_text ?? null,
        faq:           body.config.faq,
        max_turns:     body.config.max_turns,
        scoring_rules: body.config.scoring_rules,
        active:        body.config.active,
        updated_at:    new Date().toISOString(),
      })
      .eq('id', configId)
      .eq('agency_id', agencyId);
  } else {
    // Neuen Config anlegen
    const { data: newConfig } = await svc
      .from('bot_configs')
      .insert({
        agency_id:     agencyId,
        persona:       body.config.persona,
        tone:          body.config.tone,
        formality:     body.config.formality,
        language:      body.config.language,
        allowed_languages: ['de'],
        intro_text:    body.config.intro_text ?? null,
        faq:           body.config.faq,
        max_turns:     body.config.max_turns,
        handover_rules: {},
        scoring_rules: body.config.scoring_rules,
        active:        body.config.active,
      })
      .select('id')
      .single();

    if (!newConfig) {
      return NextResponse.json({ error: 'Config konnte nicht angelegt werden' }, { status: 500 });
    }

    configId = newConfig.id as string;

    // jobs.bot_config_id aktualisieren (agency-scoped)
    await svc
      .from('jobs')
      .update({ bot_config_id: configId })
      .eq('id', jobId)
      .eq('agency_id', agencyId);
  }

  // --- Fragen vollständig ersetzen: erst DELETE, dann INSERT ---
  await svc
    .from('bot_questions')
    .delete()
    .eq('bot_config_id', configId)
    .eq('agency_id', agencyId);

  if (finalQuestions.length > 0) {
    await svc
      .from('bot_questions')
      .insert(
        finalQuestions.map((q, idx) => ({
          agency_id:     agencyId,
          bot_config_id: configId,
          position:      idx,
          key:           q.key,
          text:          q.text,
          type:          q.type,
          options:       q.options ?? null,
          required:      q.required,
          knockout_rule: q.knockout_rule ?? null,
          weight:        q.weight,
        }))
      );
  }

  return NextResponse.json({ ok: true, config_id: configId });
}
