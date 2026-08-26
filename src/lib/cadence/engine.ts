import { SupabaseClient } from '@supabase/supabase-js';

type CallWindow = 'morning' | 'afternoon' | 'evening';

const BERLIN_TZ = 'Europe/Berlin';

// ---------- Helpers ----------

/**
 * Returns the current time-of-day window based on Europe/Berlin time.
 */
export function getCurrentWindow(): CallWindow {
  const berlinHour = getBerlinHour(new Date());
  if (berlinHour < 12) return 'morning';
  if (berlinHour < 16) return 'afternoon';
  return 'evening';
}

/**
 * Returns the next different window (rotating: morning -> afternoon -> evening -> morning).
 */
export function getNextDifferentWindow(currentWindow: CallWindow): CallWindow {
  switch (currentWindow) {
    case 'morning':
      return 'afternoon';
    case 'afternoon':
      return 'evening';
    case 'evening':
      return 'morning';
  }
}

/**
 * Sets the time on a date to match the given call window in Europe/Berlin timezone.
 * morning  -> 09:00 Berlin
 * afternoon -> 14:00 Berlin
 * evening  -> 18:00 Berlin
 *
 * Returns a new Date (UTC).
 */
export function getWindowTime(date: Date, window: CallWindow): Date {
  const targetHour = window === 'morning' ? 9 : window === 'afternoon' ? 14 : 18;

  // Build an ISO date string for the Berlin date then convert to UTC
  const berlinDate = new Intl.DateTimeFormat('en-CA', {
    timeZone: BERLIN_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date); // e.g. "2026-08-26"

  // Create the target datetime in Berlin, then find the UTC offset
  const berlinTarget = new Date(`${berlinDate}T${String(targetHour).padStart(2, '0')}:00:00`);

  // Calculate the Berlin offset for that moment
  const utcEquivalent = dateInBerlinToUTC(berlinDate, targetHour);

  return utcEquivalent ?? berlinTarget;
}

/**
 * Convert a Berlin date+hour to a UTC Date.
 */
function dateInBerlinToUTC(berlinDateStr: string, hour: number): Date {
  // Use a formatter trick: format a known UTC time in Berlin to find offset
  const probe = new Date(`${berlinDateStr}T12:00:00Z`);
  const berlinParts = new Intl.DateTimeFormat('en-US', {
    timeZone: BERLIN_TZ,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(probe);
  const berlinHourAtNoon = Number(berlinParts.find(p => p.type === 'hour')?.value ?? 12);
  const offsetHours = berlinHourAtNoon - 12; // e.g. +2 for CEST

  const utc = new Date(`${berlinDateStr}T${String(hour).padStart(2, '0')}:00:00Z`);
  utc.setHours(utc.getHours() - offsetHours);
  return utc;
}

/**
 * Get the current hour in Berlin timezone.
 */
function getBerlinHour(date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BERLIN_TZ,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  return Number(parts.find(p => p.type === 'hour')?.value ?? 12);
}

/**
 * Add days to a date.
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Enforce quiet hours: no tasks before 08:00 or after 20:00 Europe/Berlin.
 * If the time falls outside, push to next valid slot.
 */
function enforceQuietHours(date: Date): Date {
  const berlinHour = getBerlinHour(date);

  if (berlinHour >= 20) {
    // Push to next day 09:00 Berlin
    return getWindowTime(addDays(date, 1), 'morning');
  }
  if (berlinHour < 8) {
    // Push to same day 09:00 Berlin
    return getWindowTime(date, 'morning');
  }
  return date;
}

// ---------- Cadence schedule definition ----------

interface CadenceStep {
  daysFromNow: number;
  window: CallWindow | 'different'; // 'different' = rotate from current
}

/**
 * Schedule for attempts 2-6 (attempt 1 is immediate).
 * Index 0 = transition from attempt 1 -> 2
 * Index 4 = transition from attempt 5 -> 6
 */
const CADENCE_STEPS: CadenceStep[] = [
  { daysFromNow: 0, window: 'different' },    // attempt 1->2: same day, +3h, different window
  { daysFromNow: 1, window: 'morning' },      // attempt 2->3: next day, morning
  { daysFromNow: 1, window: 'afternoon' },    // attempt 3->4: +1 day, afternoon
  { daysFromNow: 2, window: 'evening' },      // attempt 4->5: +2 days, evening
  { daysFromNow: 3, window: 'morning' },      // attempt 5->6: +3 days, morning
];

// ---------- Core functions ----------

/**
 * Start the Nicht-Erreicht cadence for a candidate.
 * Sets cadence_active = true, cadence_attempt = 0,
 * and schedules the first attempt 15 minutes from now.
 */
export async function startCadence(
  supabase: SupabaseClient,
  candidateId: string,
  _agencyId: string
) {
  const now = new Date();
  const nextAt = new Date(now.getTime() + 15 * 60 * 1000); // +15 min
  const nextWindow = getCurrentWindow();

  await supabase
    .from('candidates')
    .update({
      cadence_active: true,
      cadence_attempt: 0,
      cadence_next_at: enforceQuietHours(nextAt).toISOString(),
      cadence_next_window: nextWindow,
      cadence_stopped_reason: null,
    })
    .eq('id', candidateId);
}

/**
 * Advance the cadence after a "nicht_erreicht" call result.
 * Increments cadence_attempt and calculates the next call time/window.
 * Creates an internal_task for the next attempt.
 * Stops cadence after attempt 6 (max_attempts).
 */
export async function advanceCadence(
  supabase: SupabaseClient,
  candidateId: string
) {
  // Fetch current state
  const { data: candidate } = await supabase
    .from('candidates')
    .select('cadence_attempt, cadence_next_window, agency_id, name')
    .eq('id', candidateId)
    .single();

  if (!candidate) return;

  const currentAttempt = (candidate.cadence_attempt ?? 0) + 1;

  // After 6 attempts, stop cadence
  if (currentAttempt >= 6) {
    await stopCadence(supabase, candidateId, 'max_attempts');
    return;
  }

  const stepIndex = currentAttempt - 1; // 0-based
  const step = CADENCE_STEPS[stepIndex];
  if (!step) {
    await stopCadence(supabase, candidateId, 'max_attempts');
    return;
  }

  const now = new Date();
  let nextWindow: CallWindow;

  if (step.window === 'different') {
    const currentWindow = (candidate.cadence_next_window as CallWindow) ?? getCurrentWindow();
    nextWindow = getNextDifferentWindow(currentWindow);
  } else {
    nextWindow = step.window;
  }

  let nextAt: Date;
  if (stepIndex === 0) {
    // Attempt 1->2: same day, +3 hours
    nextAt = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  } else {
    // Use daysFromNow + window time
    const targetDate = addDays(now, step.daysFromNow);
    nextAt = getWindowTime(targetDate, nextWindow);
  }

  nextAt = enforceQuietHours(nextAt);

  // Update candidate cadence state
  await supabase
    .from('candidates')
    .update({
      cadence_attempt: currentAttempt,
      cadence_next_at: nextAt.toISOString(),
      cadence_next_window: nextWindow,
    })
    .eq('id', candidateId);

  // Create internal task for the next call attempt
  const attemptLabel = currentAttempt + 1; // The upcoming attempt number
  const windowLabel = nextWindow === 'morning' ? 'Vormittag' : nextWindow === 'afternoon' ? 'Nachmittag' : 'Abend';
  const isLastChance = currentAttempt === 5; // attempt 6 is last chance

  await supabase.from('internal_tasks').insert({
    title: `Anrufversuch #${attemptLabel} ${isLastChance ? '(letzte Chance) ' : ''}— ${candidate.name}`,
    description: `Kadenz-Anruf im Zeitfenster: ${windowLabel}. ${isLastChance ? 'Letzter Versuch vor Kadenz-Ende.' : ''}`,
    agency_id: candidate.agency_id,
    status: 'todo',
    priority: isLastChance ? 'urgent' : 'high',
    due_date: nextAt.toISOString().split('T')[0],
    created_by: null,
  });
}

/**
 * Stop the cadence for a candidate.
 * Sets cadence_active = false and records the reason.
 * Marks any pending cadence tasks as done.
 */
export async function stopCadence(
  supabase: SupabaseClient,
  candidateId: string,
  reason: string
) {
  // Get candidate name for task matching
  const { data: candidate } = await supabase
    .from('candidates')
    .select('name, agency_id')
    .eq('id', candidateId)
    .single();

  await supabase
    .from('candidates')
    .update({
      cadence_active: false,
      cadence_stopped_reason: reason,
      cadence_next_at: null,
      cadence_next_window: null,
    })
    .eq('id', candidateId);

  // Complete any pending cadence tasks for this candidate
  if (candidate) {
    await supabase
      .from('internal_tasks')
      .update({ status: 'done' })
      .eq('agency_id', candidate.agency_id)
      .like('title', `Anrufversuch%${candidate.name}`)
      .in('status', ['backlog', 'todo', 'in_progress']);
  }
}
