import { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Audit-Log. Spalten (live geprüft): user_id, agency_id, entity_type, entity_id (uuid, Pflicht),
 * action, changes (jsonb, Array {field, old, new} – so liest es /admin/audit), ip_address, user_agent.
 * Es gibt KEINE Spalten actor_id, target oder data.
 *
 * Geschrieben wird immer mit dem Admin-Client: Die RLS-Policy auf audit_log erlaubt INSERT nur
 * internen Nutzern – Kunden-Aktionen (Jobs, Bewerbungen …) liefen sonst in RLS-Fehler.
 * user_id bleibt der echte Nutzer.
 */

export type AuditEntityType =
  | 'candidate' | 'agency' | 'user' | 'automation' | 'template' | 'pipeline_stage' | 'consent'
  | 'recording' | 'settings' | 'job' | 'application' | 'export' | 'webhook';

export type AuditAction =
  | 'create' | 'update' | 'delete' | 'access' | 'impersonate' | 'export' | 'anonymize' | 'reject';

export type AuditChange = { field: string; old?: unknown; new?: unknown; old_label?: string; new_label?: string };

interface AuditEntry {
  user_id?: string | null;
  agency_id?: string | null;
  entity_type: AuditEntityType;
  entity_id: string;
  action: AuditAction;
  changes?: AuditChange[];
  ip_address?: string | null;
  user_agent?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Schreibt einen Audit-Eintrag. Der übergebene Client wird nur aus Kompatibilität angenommen –
 * geschrieben wird mit dem Admin-Client (siehe oben). Fehler werden geloggt, nie geworfen.
 */
export async function logAudit(_supabase: SupabaseClient | null, entry: AuditEntry): Promise<void> {
  try {
    const { error } = await createAdminClient().from('audit_log').insert({
      user_id: entry.user_id ?? null,
      agency_id: entry.agency_id ?? null,
      entity_type: entry.entity_type,
      entity_id: entry.entity_id,
      action: entry.action,
      changes: entry.changes ?? null,
      ip_address: entry.ip_address ?? null,
      user_agent: entry.user_agent ?? null,
    });
    if (error) console.error('[audit] Eintrag fehlgeschlagen', entry.entity_type, entry.action, error.message);
  } catch (e) {
    console.error('[audit] Eintrag fehlgeschlagen', entry.entity_type, entry.action, e);
  }
}

/** Wandelt ein Objekt in die Array-Form für `changes` um ({field, new}). */
export function alsChanges(obj: Record<string, unknown>): AuditChange[] {
  return Object.entries(obj).map(([field, wert]) => ({ field, new: wert }));
}

/**
 * Bequemer Eintrag für Admin-/Systemaktionen mit sprechender Aktion (z. B. 'freigabe.an') und
 * beliebigem Ziel. Die sprechende Aktion und das Ziel landen in `changes` (Felder „ereignis“, „ziel“),
 * `action` ist einer der erlaubten Werte. entity_id: Ziel, wenn es eine UUID ist, sonst agency_id
 * bzw. user_id (die Spalte ist Pflicht und vom Typ uuid).
 */
export async function auditEreignis(opts: {
  userId: string | null;
  agencyId: string | null;
  entityType: AuditEntityType;
  action: AuditAction;
  ereignis: string;
  ziel?: string | null;
  daten?: Record<string, unknown>;
}): Promise<void> {
  const ziel = opts.ziel ?? null;
  const entityId = (ziel && UUID_RE.test(ziel) ? ziel : null) ?? opts.agencyId ?? opts.userId;
  if (!entityId) {
    console.error('[audit] keine entity_id für', opts.ereignis);
    return;
  }
  await logAudit(null, {
    user_id: opts.userId,
    agency_id: opts.agencyId,
    entity_type: opts.entityType,
    entity_id: entityId,
    action: opts.action,
    changes: [
      { field: 'ereignis', new: opts.ereignis },
      ...(ziel ? [{ field: 'ziel', new: ziel }] : []),
      ...alsChanges(opts.daten ?? {}),
    ],
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
