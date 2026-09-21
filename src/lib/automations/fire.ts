import { createAdminClient } from '@/lib/supabase/admin';
import { fireAutomations } from './engine';

export async function fireEvent(
  trigger_event: string,
  agency_id: string,
  data?: {
    candidate_id?: string;
    candidate?: Record<string, unknown>;
    extra?: Record<string, unknown>;
  },
  options?: {
    suppress?: string[];
    application_id?: string;
    conversation_id?: string;
  },
): Promise<void> {
  // Suppress-Check: wenn dieser trigger_event in der Liste steht, überspringen
  if (options?.suppress?.includes(trigger_event)) return;

  const supabase = createAdminClient();

  // Kandidaten-Daten nachladen, falls nur ID übergeben wurde
  let candidate = data?.candidate;
  if (data?.candidate_id && !candidate) {
    const { data: c } = await supabase
      .from('candidates')
      .select('*')
      .eq('id', data.candidate_id)
      .eq('agency_id', agency_id)
      .single();
    candidate = c ?? undefined;
  }

  await fireAutomations(supabase, {
    trigger_event,
    agency_id,
    candidate_id: data?.candidate_id,
    candidate,
    data: data?.extra,
    application_id: options?.application_id,
    conversation_id: options?.conversation_id,
  });
}
