import { SupabaseClient } from '@supabase/supabase-js';
import { createNotificationForAgency } from '@/lib/notifications/create';

/** Terminal statuses that end the recruiting flow */
const TERMINAL_STATUSES = ['abgelehnt', 'abgesprungen'] as const;

/** The ordered stage keys matching the D2D template */
const STAGE_ORDER = [
  'eingang',
  'erstkontakt',
  'erstgespraech',
  'vorstellungsgespraech',
  'probetag',
  'quali_woche',
  'akademie',
  'onboarding',
] as const;

type TerminalStatus = (typeof TERMINAL_STATUSES)[number];

interface TransitionResult {
  success: boolean;
  event_id?: string;
  error?: string;
}

/**
 * Transitions a candidate to the next recruiting stage.
 *
 * 1. Gets current stage from candidate
 * 2. Validates the transition (next in order or terminal status)
 * 3. Checks gate conditions
 * 4. Inserts candidate_stage_events record
 * 5. Updates candidates.recruiting_stage_key
 * 6. If onboarding: sets recruiting_status='eingestellt', eingestellt_am=now()
 * 7. Creates notification for agency
 */
export async function transitionCandidate(
  supabase: SupabaseClient,
  candidateId: string,
  nachStage: string,
  userId?: string,
  notiz?: string
): Promise<TransitionResult> {
  // Get candidate with agency info
  const { data: candidate, error: candidateError } = await supabase
    .from('candidates')
    .select('id, agency_id, name, recruiting_stage_key, recruiting_status, vorquali_json')
    .eq('id', candidateId)
    .single();

  if (candidateError || !candidate) {
    return { success: false, error: 'Bewerber nicht gefunden' };
  }

  // Cannot transition if already in a terminal status
  if (candidate.recruiting_status === 'eingestellt') {
    return { success: false, error: 'Bewerber ist bereits eingestellt' };
  }
  if (
    candidate.recruiting_status === 'abgelehnt' ||
    candidate.recruiting_status === 'abgesprungen'
  ) {
    return {
      success: false,
      error: `Bewerber hat Status "${candidate.recruiting_status}" und kann nicht mehr bewegt werden`,
    };
  }

  const vonStage = candidate.recruiting_stage_key;

  // Check if nach_stage is a terminal status (rejection/dropout)
  const isTerminal = (TERMINAL_STATUSES as readonly string[]).includes(nachStage);

  if (!isTerminal) {
    // Validate forward progression
    const currentIndex = vonStage
      ? (STAGE_ORDER as readonly string[]).indexOf(vonStage)
      : -1;
    const nextIndex = (STAGE_ORDER as readonly string[]).indexOf(nachStage);

    if (nextIndex === -1) {
      return { success: false, error: `Ungültige Stufe: ${nachStage}` };
    }

    // Must be the next stage in order (or first stage if no current stage)
    if (nextIndex !== currentIndex + 1) {
      const expectedStage =
        currentIndex + 1 < STAGE_ORDER.length
          ? STAGE_ORDER[currentIndex + 1]
          : 'keine weitere Stufe';
      return {
        success: false,
        error: `Ungültiger Übergang: Von "${vonStage ?? 'kein Stadium'}" nach "${nachStage}" nicht erlaubt. Erwartete nächste Stufe: "${expectedStage}"`,
      };
    }

    // Check gate conditions
    const gateError = checkGateCondition(nachStage, candidate.vorquali_json);
    if (gateError) {
      return { success: false, error: gateError };
    }
  }

  // Insert the event record
  const { data: event, error: eventError } = await supabase
    .from('candidate_stage_events')
    .insert({
      candidate_id: candidateId,
      von_stage: vonStage,
      nach_stage: nachStage,
      ausgeloest_von: userId ?? null,
      notiz: notiz ?? null,
    })
    .select('id')
    .single();

  if (eventError) {
    return { success: false, error: `Event konnte nicht erstellt werden: ${eventError.message}` };
  }

  // Build update payload for candidate
  const updatePayload: Record<string, unknown> = {};

  if (isTerminal) {
    updatePayload.recruiting_status = nachStage as TerminalStatus;
    // Keep the stage_key as-is for history
  } else {
    updatePayload.recruiting_stage_key = nachStage;

    // Track first contact attempt
    if (nachStage === 'erstkontakt' && !candidate.recruiting_stage_key) {
      updatePayload.erster_kontaktversuch_am = new Date().toISOString();
    }

    // Onboarding = eingestellt
    if (nachStage === 'onboarding') {
      updatePayload.recruiting_status = 'eingestellt';
      updatePayload.eingestellt_am = new Date().toISOString();
    }
  }

  const { error: updateError } = await supabase
    .from('candidates')
    .update(updatePayload)
    .eq('id', candidateId);

  if (updateError) {
    return {
      success: false,
      error: `Bewerber konnte nicht aktualisiert werden: ${updateError.message}`,
    };
  }

  // Send notification to agency
  const stageName = isTerminal
    ? nachStage === 'abgelehnt'
      ? 'Abgelehnt'
      : 'Abgesprungen'
    : nachStage;

  await createNotificationForAgency(supabase, candidate.agency_id, {
    title: `Bewerber ${candidate.name}: ${stageName}`,
    body: notiz
      ? `${candidate.name} wurde nach "${stageName}" verschoben. Notiz: ${notiz}`
      : `${candidate.name} wurde nach "${stageName}" verschoben.`,
    type: 'stage_change',
    entity_type: 'candidate',
    entity_id: candidateId,
  });

  return { success: true, event_id: event.id };
}

/**
 * Check gate conditions for a stage transition.
 * Returns an error message if the gate is not met, null if OK.
 */
function checkGateCondition(
  nachStage: string,
  vorqualiJson: Record<string, unknown> | null
): string | null {
  const vorquali = vorqualiJson ?? {};

  switch (nachStage) {
    case 'quali_woche':
      // Gate: probetag_bestanden
      if (!vorquali.probetag_bestanden) {
        return 'Gate-Bedingung nicht erfüllt: Probetag muss als bestanden markiert sein';
      }
      break;

    case 'akademie':
      // Gate: akademie_abgeschlossen is checked BEFORE entering, which means
      // the previous stage (quali_woche) must be passed
      if (!vorquali.akademie_abgeschlossen) {
        return 'Gate-Bedingung nicht erfüllt: Akademie muss als abgeschlossen markiert sein';
      }
      break;
  }

  return null;
}
