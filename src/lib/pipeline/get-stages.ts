import { SupabaseClient } from '@supabase/supabase-js';

export interface PipelineStage {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  agency_id: string | null;
  stage_type?: string | null;
}

/** Phase „Eingestellt“: über stage_type, bei Altdaten ohne Typ über den Namen */
export function istEingestelltStage(s: { name: string; stage_type?: string | null }): boolean {
  return s.stage_type === 'hired' || /^eingestellt/i.test(s.name);
}

/**
 * Returns pipeline stages for an agency.
 * If the agency has custom stages, returns those.
 * Otherwise returns the global defaults (agency_id IS NULL).
 */
export async function getStagesForAgency(
  supabase: SupabaseClient,
  agencyId: string | null
): Promise<PipelineStage[]> {
  if (agencyId) {
    // Check for custom stages first
    const { data: custom } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('agency_id', agencyId)
      .order('sort_order', { ascending: true });

    if (custom && custom.length > 0) return custom;
  }

  // Fall back to global stages
  const { data: global } = await supabase
    .from('pipeline_stages')
    .select('*')
    .is('agency_id', null)
    .order('sort_order', { ascending: true });

  return global ?? [];
}

/**
 * Phase eines Typs für einen Kunden – eigene Phasen, sonst die Standard-Phasen.
 * Mehrere Typen = Rangfolge (z. B. ['qualified', 'qualifying']: Standard-Phase „Qualifiziert“ = qualified, ältere Kunden-Phasen evtl. „qualifying“).
 */
export async function stageVomTyp(supabase: SupabaseClient, agencyId: string, typen: string[]): Promise<(PipelineStage & Record<string, unknown>) | null> {
  const stages = (await getStagesForAgency(supabase, agencyId)) as Array<PipelineStage & Record<string, unknown>>;
  for (const t of typen) {
    const s = stages.find((x) => x.stage_type === t);
    if (s) return s;
  }
  return null;
}

/** Phase per ID – egal ob kundeneigen oder Standard (Standard-Phasen haben agency_id = null) */
export async function stageVonId(supabase: SupabaseClient, stageId: string | null | undefined, agencyId: string): Promise<{ id: string; name: string; stage_type: string | null } | null> {
  if (!stageId) return null;
  const { data } = await supabase.from('pipeline_stages').select('id, name, stage_type, agency_id').eq('id', stageId).maybeSingle();
  const s = data as { id: string; name: string; stage_type: string | null; agency_id: string | null } | null;
  if (!s || (s.agency_id && s.agency_id !== agencyId)) return null;
  return s;
}

/** Typen, die als „qualifiziert, wartet auf Kontakt durch Menschen“ gelten */
export const QUALIFIZIERT_TYPEN = ['qualified', 'qualifying'];
