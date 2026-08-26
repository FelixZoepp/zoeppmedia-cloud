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
}

interface Condition {
  field: string;
  operator: 'eq' | 'neq' | 'gt' | 'lt' | 'in' | 'contains';
  value: unknown;
}

interface Action {
  type: 'send_notification' | 'change_stage' | 'create_task' | 'set_field' | 'log_activity';
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

async function executeAction(
  supabase: SupabaseClient,
  action: Action,
  context: AutomationContext
): Promise<void> {
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
  const executedActions: { type: string; status: string; error?: string }[] = [];
  let overallStatus: 'success' | 'failed' = 'success';
  let overallError: string | undefined;

  for (const action of automation.actions) {
    try {
      await executeAction(supabase, action, context);
      executedActions.push({ type: action.type, status: 'success' });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      executedActions.push({ type: action.type, status: 'failed', error: errorMessage });
      overallStatus = 'failed';
      overallError = errorMessage;
      // Continue executing remaining actions — one failure should not block others
    }
  }

  // Log the run
  await supabase.from('automation_runs').insert({
    automation_id: automation.id,
    agency_id: context.agency_id,
    candidate_id: context.candidate_id ?? null,
    trigger_data: context.data ?? {},
    actions_executed: executedActions,
    status: overallStatus,
    error_message: overallError ?? null,
  });
}
