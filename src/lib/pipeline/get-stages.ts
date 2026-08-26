import { SupabaseClient } from '@supabase/supabase-js';

export interface PipelineStage {
  id: string;
  name: string;
  sort_order: number;
  color: string;
  agency_id: string | null;
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
