import { SupabaseClient } from '@supabase/supabase-js';
import { startCadence, advanceCadence, stopCadence } from './engine';

/**
 * Called after a call is logged. Handles cadence logic based on the call result.
 *
 * Cadence STOPS when: candidate answers (any contact result), wrong number, or opt-out.
 * Cadence STARTS on first "nicht_erreicht" if not already active.
 * Cadence ADVANCES on subsequent "nicht_erreicht" results.
 * wieClose (Freigabe anruf_modus_wie_close): nächster Versuch erst morgen 08:00 Berlin.
 */
export async function handleCallResultForCadence(
  supabase: SupabaseClient,
  candidateId: string,
  agencyId: string,
  result: string,
  opts: { wieClose?: boolean } = {},
) {
  // Fetch current cadence state
  const { data: candidate } = await supabase
    .from('candidates')
    .select('cadence_active, cadence_attempt')
    .eq('id', candidateId)
    .single();

  if (!candidate) return;

  // Contact made — stop cadence
  const contactResults = ['termin_vereinbart', 'kein_interesse', 'rueckruf', 'sonstiges'];
  if (contactResults.includes(result)) {
    if (candidate.cadence_active) {
      await stopCadence(supabase, candidateId, 'contact_made');
    }
    return;
  }

  // Wrong number — stop cadence
  if (result === 'falsche_nummer') {
    if (candidate.cadence_active) {
      await stopCadence(supabase, candidateId, 'wrong_number');
    }
    return;
  }

  // Nicht erreicht — start or advance cadence
  if (result === 'nicht_erreicht') {
    if (!candidate.cadence_active) {
      await startCadence(supabase, candidateId, agencyId);
    }
    await advanceCadence(supabase, candidateId, opts);
    return;
  }
}
