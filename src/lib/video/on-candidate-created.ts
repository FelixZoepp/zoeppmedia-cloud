import { SupabaseClient } from '@supabase/supabase-js';
import { createVideoViewLink } from './create-view-link';

/**
 * Called after a new candidate is created.
 * If the agency has an active dankevideo, creates a tracked view link.
 * Returns the link URL or null.
 */
export async function handleDankevideoForNewCandidate(
  supabase: SupabaseClient,
  agencyId: string,
  candidateId: string
): Promise<string | null> {
  // Check if agency has active dankevideo
  const { data: agency } = await supabase
    .from('agencies')
    .select('dankevideo_url, dankevideo_active')
    .eq('id', agencyId)
    .single();

  if (!agency?.dankevideo_url || !agency.dankevideo_active) return null;

  return createVideoViewLink(supabase, agencyId, candidateId, agency.dankevideo_url);
}
