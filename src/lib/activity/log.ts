import { SupabaseClient } from '@supabase/supabase-js';

export async function logActivity(
  supabase: SupabaseClient,
  params: {
    agency_id?: string | null;
    user_id?: string | null;
    candidate_id?: string | null;
    action: string;
    action_type: string;
    metadata?: Record<string, unknown>;
  }
) {
  try {
    await supabase.from('activity_log').insert({
      agency_id: params.agency_id ?? null,
      user_id: params.user_id ?? null,
      candidate_id: params.candidate_id ?? null,
      action: params.action,
      action_type: params.action_type,
      metadata: params.metadata ?? {},
    });
  } catch {
    // Activity logging should never break the main operation
  }
}
