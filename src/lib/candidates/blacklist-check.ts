import { SupabaseClient } from '@supabase/supabase-js';

export interface BlacklistMatch {
  id: string;
  name: string;
  blacklist_reason: string | null;
  noshow_points: number;
}

export interface BlacklistCheckResult {
  is_blacklisted: boolean;
  matching_candidate?: BlacklistMatch;
}

export async function checkBlacklist(
  supabase: SupabaseClient,
  agencyId: string,
  email?: string | null,
  phone?: string | null
): Promise<BlacklistCheckResult> {
  if (!email && !phone) {
    return { is_blacklisted: false };
  }

  let query = supabase
    .from('candidates')
    .select('id, name, blacklist_reason, noshow_points')
    .eq('agency_id', agencyId)
    .eq('blacklisted', true);

  if (email && phone) {
    query = query.or(`email.ilike.${email},phone.eq.${phone}`);
  } else if (email) {
    query = query.ilike('email', email);
  } else if (phone) {
    query = query.eq('phone', phone);
  }

  const { data } = await query.limit(1).maybeSingle();

  if (data) {
    return {
      is_blacklisted: true,
      matching_candidate: {
        id: data.id,
        name: data.name,
        blacklist_reason: data.blacklist_reason,
        noshow_points: data.noshow_points,
      },
    };
  }

  return { is_blacklisted: false };
}
