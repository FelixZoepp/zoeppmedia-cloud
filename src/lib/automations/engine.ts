import { SupabaseClient } from '@supabase/supabase-js';
import {
  createNotification,
  createNotificationForAgency,
  createNotificationForInternals,
  NotificationType,
} from '@/lib/notifications/create';
import { logActivity } from '@/lib/activity/log';

// --- Types ---

export interface AutomationContext {
  trigger_event: string;
  agency_id: string;
  candidate_id?: string;
  candidate?: Record<string, unknown>;
  data?: Record<string, unknown>;
  application_id?: string;
  conversation_id?: string;
}

interface Condition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'contains';
  value: unknown;
}

interface Action {
  type:
    | 'send_notification'
    | 'change_stage'
    | 'create_task'
    | 'set_field'
    | 'log_activity'
    | 'send_template'
    | 'send_message'
    | 'start_bot'
    | 'set_stage_application'
    | 'assign_application'
    | 'send_email'
    | 'schedule_job'
    | 'call_webhook'
    | 'add_note';
  params: Record<string, unknown>;
}

interface Automation {
  id: string;
  agency_id: string | null;
  name: string;
  trigger_event: string;
  conditions: Condition[];
  actions: Action[];
  delay_seconds: number;
  active: boolean;
  is_system: boolean;
}

// Fields that set_field is allowed to update on candidates
const ALLOWED_SET_FIELDS = new Set([
  'do_not_contact',
  'noshow_points',
  'notes',
  'source',
  'email',
  'phone',
]);

// --- Template resolution ---

/**
 * Resolve {{candidate.name}}, {{data.new_stage_name}}, etc. from context.
 */
function resolveTemplate(template: string, context: AutomationContext): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
    const value = resolveField(path, context);
    if (value === undefined || value === null) return '';
    return String(value);
  });
}

/**
 * Resolve a dot-notation field path against the context.
 * e.g. "candidate.source" → context.candidate?.source
 */
function resolveField(path: string, context: AutomationContext): unknown {
  const parts = path.split('.');
  let current: unknown = context;

  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }

  return current;
}

// --- Condition evaluation ---

function evaluateConditions(conditions: Condition[], context: AutomationContext): boolean {
  if (!conditions || conditions.length === 0) return true;

  return conditions.every((condition) => {
    const fieldValue = resolveField(condition.field, context);
    return evaluateCondition(fieldValue, condition.operator, condition.value);
  });
}

/** Exportiert für Unit-Tests. */
export function evaluateConditionExported(fieldValue: unknown, operator: string, conditionValue: unknown): boolean {
  return evaluateCondition(fieldValue, operator, conditionValue);
}

function evaluateCondition(fieldValue: unknown, operator: string, conditionValue: unknown): boolean {
  switch (operator) {
    case 'eq':
      return fieldValue === conditionValue;
    case 'neq':
      return fieldValue !== conditionValue;
    case 'gt':
      return typeof fieldValue === 'number' && typeof conditionValue === 'number' && fieldValue > conditionValue;
    case 'lt':
      return typeof fieldValue === 'number' && typeof conditionValue === 'number' && fieldValue < conditionValue;
    case 'in':
      return Array.isArray(conditionValue) && conditionValue.includes(fieldValue);
    case 'contains':
      return typeof fieldValue === 'string' && typeof conditionValue === 'string' && fieldValue.includes(conditionValue);
    default:
      return false;
  }
}

// --- Action execution ---

interface ActionDetail {
  status?: 'success' | 'skipped';
  response_status?: number;
}

async function executeAction(
  supabase: SupabaseClient,
  action: Action,
  context: AutomationContext
): Promise<ActionDetail | void> {
  switch (action.type) {
    case 'send_notification':
      await executeSendNotification(supabase, action.params, context);
      break;
    case 'change_stage':
      await executeChangeStage(supabase, action.params, context);
      break;
    case 'create_task':
      await executeCreateTask(supabase, action.params, context);
      break;
    case 'set_field':
      await executeSetField(supabase, action.params, context);
      break;
    case 'log_activity':
      await executeLogActivity(supabase, action.params, context);
      break;
    case 'set_stage_application':
      await executeSetStageApplication(supabase, action.params, context);
      break;
    case 'assign_application':
      await executeAssignApplication(supabase, action.params, context);
      break;
    case 'send_template':
      await executeSendTemplate(supabase, action.params, context);
      break;
    case 'send_message':
      return await executeSendMessage(supabase, action.params, context);
    case 'start_bot':
      await executeStartBot(supabase, action.params, context);
      break;
    case 'send_email':
      await executeSendEmail(supabase, action.params, context);
      break;
    case 'schedule_job':
      await executeScheduleJob(supabase, action.params, context);
      break;
    case 'call_webhook':
      return await executeCallWebhook(supabase, action.params, context);
    case 'add_note':
      await executeAddNote(supabase, action.params, context);
      break;
    default:
      throw new Error(`Unknown action type: ${(action as Action).type}`);
  }
}

async function executeSendNotification(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  context: AutomationContext
): Promise<void> {
  const title = resolveTemplate(String(params.title ?? ''), context);
  const body = params.body ? resolveTemplate(String(params.body), context) : undefined;
  const type = (params.type as NotificationType) ?? 'system';
  const userScope = params.user_scope as string | undefined;

  if (userScope === 'agency') {
    await createNotificationForAgency(supabase, context.agency_id, {
      title,
      body,
      type,
      entity_type: context.candidate_id ? 'candidate' : undefined,
      entity_id: context.candidate_id,
    });
  } else if (userScope === 'internals') {
    await createNotificationForInternals(supabase, {
      title,
      body,
      type,
      entity_type: context.candidate_id ? 'candidate' : undefined,
      entity_id: context.candidate_id,
    });
  } else if (typeof userScope === 'string' && userScope.length > 0) {
    // Treat as a specific user_id
    await createNotification(supabase, {
      user_id: userScope,
      agency_id: context.agency_id,
      title,
      body,
      type,
      entity_type: context.candidate_id ? 'candidate' : undefined,
      entity_id: context.candidate_id,
    });
  }
}

async function executeChangeStage(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  context: AutomationContext
): Promise<void> {
  const stageId = params.stage_id as string;
  if (!stageId || !context.candidate_id) return;

  await supabase
    .from('candidates')
    .update({ current_stage_id: stageId })
    .eq('id', context.candidate_id);

  await supabase.from('candidate_stages').insert({
    candidate_id: context.candidate_id,
    stage_id: stageId,
    changed_by: null, // Automated change
  });
}

async function executeCreateTask(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  context: AutomationContext
): Promise<void> {
  const title = resolveTemplate(String(params.title ?? ''), context);
  const priority = (params.priority as string) ?? 'medium';
  const assignedTo = params.assigned_to as string | undefined;

  await supabase.from('internal_tasks').insert({
    agency_id: context.agency_id,
    candidate_id: context.candidate_id ?? null,
    title,
    priority,
    assigned_to: assignedTo ?? null,
    status: 'open',
    created_by: null,
  });
}

async function executeSetField(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  context: AutomationContext
): Promise<void> {
  const table = params.table as string;
  const field = params.field as string;
  const value = params.value;

  if (table !== 'candidates' || !context.candidate_id) return;
  if (!ALLOWED_SET_FIELDS.has(field)) return;

  await supabase
    .from('candidates')
    .update({ [field]: value })
    .eq('id', context.candidate_id);
}

async function executeLogActivity(
  supabase: SupabaseClient,
  params: Record<string, unknown>,
  context: AutomationContext
): Promise<void> {
  const action = resolveTemplate(String(params.action ?? ''), context);
  const actionType = String(params.action_type ?? 'automation');

  await logActivity(supabase, {
    agency_id: context.agency_id,
    candidate_id: context.candidate_id ?? null,
    action,
    action_type: actionType,
    metadata: { automated: true, trigger: context.trigger_event },
  });
}

// --- Neue Action-Implementierungen (v2) ---

async function executeSetStageApplication(
  svc: SupabaseClient,
  params: Record<string, unknown>,
  ctx: AutomationContext,
): Promise<void> {
  const stageId = params.stage_id as string;
  if (!stageId || !ctx.application_id) return;
  await svc
    .from('applications')
    .update({ stage_id: stageId, updated_at: new Date().toISOString() })
    .eq('id', ctx.application_id)
    .eq('agency_id', ctx.agency_id);
}

async function executeAssignApplication(
  svc: SupabaseClient,
  params: Record<string, unknown>,
  ctx: AutomationContext,
): Promise<void> {
  const userId = params.user_id as string;
  if (!userId || !ctx.application_id) return;
  await svc
    .from('applications')
    .update({ assigned_to: userId, updated_at: new Date().toISOString() })
    .eq('id', ctx.application_id)
    .eq('agency_id', ctx.agency_id);
}

async function executeAddNote(
  svc: SupabaseClient,
  params: Record<string, unknown>,
  ctx: AutomationContext,
): Promise<void> {
  const body = resolveTemplate(String(params.body ?? ''), ctx);
  if (!ctx.application_id) return;
  await svc.from('notes').insert({
    agency_id: ctx.agency_id,
    application_id: ctx.application_id,
    body,
    user_id: null,
  });
}

async function executeCallWebhook(
  _svc: SupabaseClient,
  params: Record<string, unknown>,
  ctx: AutomationContext,
): Promise<ActionDetail> {
  const url = params.url as string;
  if (!url) return {};

  // SSRF-Schutz: URL parsen und unzulässige Ziele ablehnen
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Ungültige Webhook-URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Ungültige Webhook-URL');
  }
  const h = parsed.hostname;
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '::1' ||
    h === '[::1]' ||
    h === '0.0.0.0' ||
    h === '169.254.169.254' ||
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  ) {
    throw new Error('Ungültige Webhook-URL');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        trigger: ctx.trigger_event,
        agency_id: ctx.agency_id,
        candidate_id: ctx.candidate_id,
        application_id: ctx.application_id,
        data: ctx.data,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Webhook fehlgeschlagen: HTTP ${res.status}`);
    }
    return { response_status: res.status };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function executeSendTemplate(
  svc: SupabaseClient,
  params: Record<string, unknown>,
  ctx: AutomationContext,
): Promise<void> {
  if (!ctx.conversation_id || !ctx.candidate_id) return;
  const presetKey = params.preset_key as string;
  if (!presetKey) return;

  const { data: conv } = await svc
    .from('conversations')
    .select('wa_account_id, candidate_id')
    .eq('id', ctx.conversation_id)
    .eq('agency_id', ctx.agency_id)
    .single();
  if (!conv) return;

  const { data: candidate } = await svc
    .from('candidates')
    .select('name, phone_e164')
    .eq('id', ctx.candidate_id)
    .eq('agency_id', ctx.agency_id)
    .single();
  if (!(candidate as Record<string, unknown> | null)?.phone_e164) return;
  const cand = candidate as Record<string, unknown>;
  const convRow = conv as Record<string, unknown>;

  const { data: tmpl } = await svc
    .from('whatsapp_templates')
    .select('id, name, variables')
    .eq('wa_account_id', convRow.wa_account_id as string)
    .eq('preset_key', presetKey)
    .eq('status', 'approved')
    .eq('agency_id', ctx.agency_id)
    .maybeSingle();
  if (!tmpl) return;
  const tmplRow = tmpl as Record<string, unknown>;

  const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
  const variables = (params.variables as string[]) ?? [];
  await sendWhatsAppMessage(svc, {
    agencyId: ctx.agency_id,
    conversationId: ctx.conversation_id,
    candidatePhone: cand.phone_e164 as string,
    waAccountId: convRow.wa_account_id as string,
    payload: {
      to: cand.phone_e164 as string,
      type: 'template',
      template: {
        name: tmplRow.name as string,
        language: { code: 'de' },
        components: [
          {
            type: 'body',
            parameters: variables.map((v) => ({ type: 'text', text: resolveTemplate(v, ctx) })),
          },
        ],
      },
    },
    senderType: 'system',
    templateId: tmplRow.id as string,
  });
}

async function executeSendMessage(
  svc: SupabaseClient,
  params: Record<string, unknown>,
  ctx: AutomationContext,
): Promise<ActionDetail> {
  if (!ctx.conversation_id || !ctx.candidate_id) return {};
  const body = resolveTemplate(String(params.body ?? ''), ctx);
  if (!body) return {};

  const { data: conv } = await svc
    .from('conversations')
    .select('wa_account_id')
    .eq('id', ctx.conversation_id)
    .eq('agency_id', ctx.agency_id)
    .single();
  if (!conv) return {};
  const convRow = conv as Record<string, unknown>;

  const { data: candidate } = await svc
    .from('candidates')
    .select('phone_e164')
    .eq('id', ctx.candidate_id)
    .eq('agency_id', ctx.agency_id)
    .single();
  if (!(candidate as Record<string, unknown> | null)?.phone_e164) return {};
  const cand = candidate as Record<string, unknown>;

  const { sendWhatsAppMessage } = await import('@/lib/whatsapp/send');
  try {
    await sendWhatsAppMessage(svc, {
      agencyId: ctx.agency_id,
      conversationId: ctx.conversation_id,
      candidatePhone: cand.phone_e164 as string,
      waAccountId: convRow.wa_account_id as string,
      payload: { to: cand.phone_e164 as string, type: 'text', text: { body } },
      senderType: 'system',
    });
    return {};
  } catch {
    // Fenster geschlossen oder anderer temporärer Fehler → überspringen
    return { status: 'skipped' };
  }
}

async function executeStartBot(
  _svc: SupabaseClient,
  _params: Record<string, unknown>,
  ctx: AutomationContext,
): Promise<void> {
  if (!ctx.application_id) return;
  const { createAdminClient } = await import('@/lib/supabase/admin');
  const adminSvc = createAdminClient();
  await adminSvc.from('scheduled_jobs').upsert(
    {
      agency_id: ctx.agency_id,
      run_at: new Date().toISOString(),
      type: 'bot.open',
      payload: { application_id: ctx.application_id },
      status: 'pending',
      dedupe_key: `bot.open:${ctx.application_id}`,
    },
    { onConflict: 'dedupe_key', ignoreDuplicates: true },
  );
}

async function executeSendEmail(
  _svc: SupabaseClient,
  params: Record<string, unknown>,
  ctx: AutomationContext,
): Promise<void> {
  const to = params.to as string;
  const subject = resolveTemplate(String(params.subject ?? ''), ctx);
  const body = resolveTemplate(String(params.body ?? ''), ctx);
  if (!to || !subject) return;

  const { Resend } = await import('resend');
  const resend = new Resend(process.env.RESEND_API_KEY ?? '');
  await resend.emails.send({
    from: 'Zoepp Media Cloud <noreply@zoepp-gruppe.de>',
    to,
    subject,
    html: body,
  });
}

async function executeScheduleJob(
  svc: SupabaseClient,
  params: Record<string, unknown>,
  ctx: AutomationContext,
): Promise<void> {
  const type = params.job_type as string;
  const delaySeconds = (params.delay_seconds as number) ?? 0;
  const payload = (params.payload as Record<string, unknown>) ?? {};
  if (!type) return;

  await svc.from('scheduled_jobs').insert({
    agency_id: ctx.agency_id,
    run_at: new Date(Date.now() + delaySeconds * 1000).toISOString(),
    type,
    payload: { ...payload, application_id: ctx.application_id, candidate_id: ctx.candidate_id },
    status: 'pending',
  });
}

// --- Main engine ---

export async function fireAutomations(
  supabase: SupabaseClient,
  context: AutomationContext
): Promise<void> {
  // Query active automations matching this trigger event and agency
  const { data: automations, error } = await supabase
    .from('automations')
    .select('*')
    .eq('trigger_event', context.trigger_event)
    .eq('active', true)
    .or(`agency_id.eq.${context.agency_id},agency_id.is.null`);

  if (error || !automations?.length) return;

  for (const row of automations) {
    const automation: Automation = {
      id: row.id,
      agency_id: row.agency_id,
      name: row.name,
      trigger_event: row.trigger_event,
      conditions: (row.conditions ?? []) as Condition[],
      actions: (row.actions ?? []) as Action[],
      delay_seconds: row.delay_seconds ?? 0,
      active: row.active,
      is_system: row.is_system,
    };

    await runSingleAutomation(supabase, automation, context);
  }
}

// --- Dedupe-Hilfsfunktionen (P4-R9c) ---

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

function computeDedupeKey(ctx: AutomationContext, actions: Action[]): string | null {
  if (!ctx.application_id) return null;
  const actionSummary = actions.map(a => `${a.type}:${JSON.stringify(a.params)}`).join('|');
  const hash = simpleHash(actionSummary);
  const hourBucket = Math.floor(Date.now() / 3600_000);
  return `${ctx.application_id}:${hash}:${hourBucket}`;
}

async function runSingleAutomation(
  supabase: SupabaseClient,
  automation: Automation,
  context: AutomationContext
): Promise<void> {
  // Skip delayed automations for now (future: queue system)
  if (automation.delay_seconds > 0) {
    await supabase.from('automation_runs').insert({
      automation_id: automation.id,
      agency_id: context.agency_id,
      candidate_id: context.candidate_id ?? null,
      trigger_data: context.data ?? {},
      actions_executed: [],
      status: 'skipped',
      error_message: `Delayed automation (${automation.delay_seconds}s) — queuing not yet implemented`,
    });
    return;
  }

  // P4-R9a: Rate-Limit — max 10 Runs pro application_id pro Stunde
  if (context.application_id) {
    const hourAgo = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await supabase.from('automation_runs')
      .select('id', { count: 'exact', head: true })
      .eq('agency_id', context.agency_id)
      .eq('application_id', context.application_id)
      .gte('created_at', hourAgo);

    if ((count ?? 0) >= 10) {
      await supabase.from('automation_runs').insert({
        automation_id: automation.id,
        agency_id: context.agency_id,
        application_id: context.application_id,
        candidate_id: context.candidate_id ?? null,
        trigger_data: context.data ?? {},
        actions_executed: [],
        status: 'skipped',
        error_message: 'Rate-Limit',
      });
      return;
    }
  }

  // Evaluate conditions
  const conditionsPassed = evaluateConditions(automation.conditions, context);
  if (!conditionsPassed) {
    await supabase.from('automation_runs').insert({
      automation_id: automation.id,
      agency_id: context.agency_id,
      candidate_id: context.candidate_id ?? null,
      trigger_data: context.data ?? {},
      actions_executed: [],
      status: 'skipped',
      error_message: 'Conditions not met',
    });
    return;
  }

  // Execute actions
  const executedActions: { type: string; status: string; error?: string; response_status?: number }[] = [];
  let overallStatus: 'success' | 'failed' = 'success';
  let overallError: string | undefined;

  for (const action of automation.actions) {
    try {
      const detail = await executeAction(supabase, action, context);
      const entry: { type: string; status: string; response_status?: number } = {
        type: action.type,
        status: (detail as ActionDetail | undefined)?.status ?? 'success',
      };
      if ((detail as ActionDetail | undefined)?.response_status !== undefined) {
        entry.response_status = (detail as ActionDetail).response_status;
      }
      executedActions.push(entry);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      executedActions.push({ type: action.type, status: 'failed', error: errorMessage });
      overallStatus = 'failed';
      overallError = errorMessage;
      // Continue executing remaining actions — one failure should not block others
    }
  }

  // P4-R9c: Dedupe-Key berechnen und upsert mit ignoreDuplicates
  const dedupeKey = computeDedupeKey(context, automation.actions);
  await supabase.from('automation_runs').upsert(
    {
      automation_id: automation.id,
      agency_id: context.agency_id,
      application_id: context.application_id ?? null,
      candidate_id: context.candidate_id ?? null,
      trigger_data: context.data ?? {},
      actions_executed: executedActions,
      status: overallStatus,
      error_message: overallError ?? null,
      ...(dedupeKey ? { dedupe_key: dedupeKey } : {}),
    },
    { onConflict: 'dedupe_key', ignoreDuplicates: true },
  );
}
