import { SupabaseClient } from '@supabase/supabase-js';
import { ingestApplication } from '@/lib/recruiting/ingest';

export function getByPath(obj: unknown, path: string): string | null {
  let cur: unknown = obj;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[key];
  }
  if (cur == null) return null;
  if (typeof cur === 'string') return cur.trim() || null;
  if (typeof cur === 'number') return String(cur);
  return null;
}

export interface GenericConfig {
  job_id?: string;
  fields?: {
    first_name?: string;
    last_name?: string;
    name?: string;
    phone?: string;
    email?: string;
    consent?: string;
  };
  consent_true_values?: string[];
}

export function mapGenericFields(body: Record<string, unknown>, config: GenericConfig) {
  const f = config.fields ?? {};
  let firstName = f.first_name ? getByPath(body, f.first_name) ?? '' : '';
  let lastName = f.last_name ? getByPath(body, f.last_name) ?? '' : '';
  if (!firstName && f.name) {
    const full = getByPath(body, f.name) ?? '';
    const parts = full.split(/\s+/);
    firstName = parts[0] ?? '';
    lastName = parts.slice(1).join(' ');
  }
  const phone = f.phone ? getByPath(body, f.phone) ?? '' : '';
  const email = f.email ? getByPath(body, f.email) : null;
  const trueValues = (config.consent_true_values ?? ['ja', 'yes', 'true', '1']).map((v) => v.toLowerCase());
  const consentRaw = f.consent ? getByPath(body, f.consent) : null;
  const consentWhatsapp = consentRaw != null && trueValues.includes(consentRaw.toLowerCase());
  return { firstName, lastName, phone, email, consentWhatsapp };
}

/** Worker für events_inbox payload.type = 'ingest.generic' (Spec §6). */
export async function processIngestGeneric(
  svc: SupabaseClient,
  agencyId: string | null,
  payload: { source_id: string; body: Record<string, unknown> }
): Promise<void> {
  const { data: source } = await svc
    .from('lead_sources')
    .select('id, agency_id, config, active')
    .eq('id', payload.source_id)
    .single();
  if (!source || !source.active) throw new Error(`ingest.generic: Quelle ${payload.source_id} nicht gefunden/inaktiv`);
  if (agencyId && source.agency_id !== agencyId) throw new Error('ingest.generic: agency mismatch');

  const config = (source.config ?? {}) as GenericConfig;
  const mapped = mapGenericFields(payload.body, config);
  if (!mapped.phone) throw new Error('ingest.generic: Telefonnummer fehlt im Mapping');

  // Job: config.job_id, sonst Default-Job der Agentur
  let jobId = config.job_id ?? null;
  if (!jobId) {
    const { data: defaultJob } = await svc
      .from('jobs')
      .select('id')
      .eq('agency_id', source.agency_id)
      .eq('is_default', true)
      .limit(1)
      .single();
    jobId = defaultJob?.id ?? null;
  }
  if (!jobId) throw new Error('ingest.generic: kein Job zugeordnet');

  const externalId = typeof payload.body.id === 'string' ? payload.body.id : null;
  await ingestApplication(svc, {
    agencyId: source.agency_id,
    jobId,
    firstName: mapped.firstName,
    lastName: mapped.lastName,
    phone: mapped.phone,
    email: mapped.email ?? null,
    source: 'generic',
    sourceRef: externalId ? `${source.id}:${externalId}` : undefined,
    consentWhatsapp: mapped.consentWhatsapp,
    consentSource: 'generic',
  });
}
