import { SupabaseClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export async function createVideoViewLink(
  supabase: SupabaseClient,
  agencyId: string,
  candidateId: string,
  videoUrl: string
): Promise<string | null> {
  if (!videoUrl) return null;

  const viewToken = crypto.randomBytes(16).toString('hex');

  const { error } = await supabase.from('video_views').insert({
    agency_id: agencyId,
    candidate_id: candidateId,
    video_url: videoUrl,
    view_token: viewToken,
  });

  if (error) return null;

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
  return `${baseUrl}/video/${viewToken}`;
}
