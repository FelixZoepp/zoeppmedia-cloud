export interface MetaSourceConfig {
  page_token?: string;
  forms?: Record<string, string>;
  default_job_id?: string;
}
export interface MetaSource {
  config: MetaSourceConfig;
}

/** Zuordnung Meta-Formular → Job über lead_sources.config (Spec §6). */
export function resolveMetaJob(
  sources: MetaSource[],
  formId: string | null
): { jobId: string | null; pageToken: string | null } {
  if (formId) {
    const exact = sources.find((s) => s.config.forms?.[formId]);
    if (exact) {
      return { jobId: exact.config.forms![formId], pageToken: exact.config.page_token ?? null };
    }
  }
  const fallback = sources.find((s) => s.config.default_job_id);
  if (fallback) {
    return { jobId: fallback.config.default_job_id!, pageToken: fallback.config.page_token ?? null };
  }
  const anyToken = sources.find((s) => s.config.page_token);
  return { jobId: null, pageToken: anyToken?.config.page_token ?? null };
}

/** Lead-Felder über die Graph API mit dem Seiten-Token des Kunden abrufen (Spec §6). */
export async function fetchLeadFromGraph(
  leadgenId: string,
  pageToken: string
): Promise<Array<{ name: string; values: string[] }> | null> {
  try {
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${encodeURIComponent(leadgenId)}?fields=field_data&access_token=${encodeURIComponent(pageToken)}`
    );
    if (!res.ok) {
      console.error('[meta-leads] Graph-API-Abruf fehlgeschlagen', res.status);
      return null;
    }
    const data = (await res.json()) as { field_data?: Array<{ name: string; values: string[] }> };
    return data.field_data ?? null;
  } catch (e) {
    console.error('[meta-leads] Graph-API-Abruf fehlgeschlagen', e);
    return null;
  }
}
