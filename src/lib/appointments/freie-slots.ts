import type { SupabaseClient } from '@supabase/supabase-js';
import { computeSlots, type Slot } from '@/lib/appointments/slots';

/** Erlaubte Termindauer in Minuten (0 würde die Slot-Engine endlos laufen lassen) */
export const MIN_DAUER_MINUTEN = 5;
export const MAX_DAUER_MINUTEN = 480;

export function dauerMinuten(wert: unknown, fallback = 30): number {
  const n = Number(wert);
  return Number.isInteger(n) && n >= MIN_DAUER_MINUTEN && n <= MAX_DAUER_MINUTEN ? n : fallback;
}

/**
 * Freie Slots für einen Termin über den Buchungslink.
 * Der Termin selbst zählt nicht als belegt (wichtig beim Verschieben).
 */
export async function ladeFreieSlots(
  svc: SupabaseClient,
  appt: { id: string; agency_id: string; application_id: string },
): Promise<{ slots: Slot[]; durationMinutes: number } | { fehler: string; status: number }> {
  const { data: application } = await svc.from('applications')
    .select('job_id').eq('id', appt.application_id).eq('agency_id', appt.agency_id).single();
  if (!application) return { fehler: 'Bewerbung nicht gefunden', status: 404 };

  const { data: job } = await svc.from('jobs')
    .select('id, appointment_duration_minutes, appointment_buffer_minutes')
    .eq('id', application.job_id).eq('agency_id', appt.agency_id).single();
  if (!job) return { fehler: 'Job nicht gefunden', status: 404 };

  const [{ data: rules }, { data: agency }, { data: booked }] = await Promise.all([
    svc.from('availability_rules')
      .select('weekday, start_time, end_time')
      .eq('job_id', job.id).eq('agency_id', appt.agency_id),
    svc.from('agencies').select('timezone').eq('id', appt.agency_id).single(),
    // Bereits gebuchte Termine für diese Agentur laden
    svc.from('appointments')
      .select('id, starts_at, ends_at')
      .eq('agency_id', appt.agency_id)
      .in('status', ['booked', 'confirmed'])
      .not('starts_at', 'is', null)
      .gte('ends_at', new Date().toISOString()),
  ]);

  const durationMinutes = dauerMinuten(job.appointment_duration_minutes);
  const slots = computeSlots({
    rules: rules ?? [],
    bookedSlots: ((booked ?? []) as Array<{ id: string; starts_at: string | null; ends_at: string | null }>)
      .filter((b) => b.id !== appt.id && b.starts_at && b.ends_at)
      .map((b) => ({ starts_at: b.starts_at!, ends_at: b.ends_at! })),
    from: new Date(),
    days: 14,
    durationMinutes,
    bufferMinutes: Math.max(0, Number(job.appointment_buffer_minutes ?? 15) || 0),
    timezone: agency?.timezone ?? 'Europe/Berlin',
  });

  return { slots, durationMinutes };
}
