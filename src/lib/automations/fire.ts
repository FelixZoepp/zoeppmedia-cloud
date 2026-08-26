import { createAdminClient } from '@/lib/supabase/admin';
import { fireAutomations } from './engine';

export async function fireEvent(
  trigger_event: string,
  agency_id: string,
  data?: {
    candidate_id?: string;
    candidate?: Record<string, unknown>;
    extra?: Record<string, unknown>;
  }
) {
  const supabase = createAdminClient();

  // Fetch candidate data if candidate_id provided but candidate object not passed
  let candidate = data?.candidate;
  if (data?.candidate_id && !candidate) {
    const { data: c } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', data.candidate_id)
      .single();
    candidate = c ?? undefined;
  }

  await fireAutomations(supabase, {
    trigger_event,
    agency_id,
    candidate_id: data?.candidate_id,
    candidate,
    data: data?.extra,
  });
}
