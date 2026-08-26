import { SupabaseClient } from '@supabase/supabase-js';

interface AuditEntry {
  user_id?: string | null;
  agency_id?: string | null;
  entity_type: 'candidate' | 'agency' | 'user' | 'automation' | 'template' | 'pipeline_stage' | 'consent' | 'recording' | 'settings';
  entity_id: string;
  action: 'create' | 'update' | 'delete' | 'access' | 'impersonate';
  changes?: Array<{ field: string; old?: unknown; new?: unknown; old_label?: string; new_label?: string }>;
  ip_address?: string | null;
  user_agent?: string | null;
}

export async function logAudit(supabase: SupabaseClient, entry: AuditEntry) {
  await supabase.from('audit_log').insert({
    user_id: entry.user_id ?? null,
    agency_id: entry.agency_id ?? null,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id,
    action: entry.action,
    changes: entry.changes ?? null,
    ip_address: entry.ip_address ?? null,
    user_agent: entry.user_agent ?? null,
  });
}

/**
 * Compare two objects and return an array of field changes.
 * Only includes fields that actually changed.
 */
export function diffChanges(
  oldObj: Record<string, unknown>,
  newObj: Record<string, unknown>,
  fields: string[]
): Array<{ field: string; old: unknown; new: unknown }> {
  const changes: Array<{ field: string; old: unknown; new: unknown }> = [];
  for (const field of fields) {
    const oldVal = oldObj[field];
    const newVal = newObj[field];
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes.push({ field, old: oldVal, new: newVal });
    }
  }
  return changes;
}
