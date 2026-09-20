import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export interface DialerQueueItem {
  candidate_id: string;
  name: string;
  phone: string | null;
  agency_id: string;
  reason: 'erinnerung' | 'kadenz' | 'rueckruf' | 'neu';
  cadence_attempt: number | null;
  cadence_window: string | null;
  callback_note: string | null;
  callback_date: string | null;
  appointment_id: string | null;
  appointment_type: 'vorstellungsgespraech' | 'probetag' | null;
  appointment_at: string | null;
  created_at: string;
}

const EMPTY_STATS = { total: 0, erinnerungen: 0, kadenz: 0, rueckrufe: 0, neue: 0 };

/**
 * Innendienst-Dialer: Call-Warteschlange über alle (zugeordneten) Agenturen.
 * Quellen: Termin-Erinnerungen (VG/Probetag in <24h), fällige Kadenz-Anrufe,
 * Rückrufe (call_logs), neue ungewählte Bewerber.
 * Priorität bei Überschneidung: Erinnerung > Kadenz > Rückruf > Neu.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const now = new Date();
  const nowIso = now.toISOString();
  const todayStr = nowIso.split('T')[0];
  const reminderHorizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  // For employees: only their assigned agencies. For admins: all.
  let agencyIds: string[] | null = null;
  if (user.role === 'employee') {
    const { data: assignments } = await supabase
      .from('employee_assignments')
      .select('agency_id')
      .eq('employee_id', user.id);
    agencyIds = (assignments ?? []).map((a) => a.agency_id);
    if (agencyIds.length === 0) {
      return NextResponse.json({ queue: [], agencies: {}, scripts: {}, stats: EMPTY_STATS });
    }
  }

  // --- Termin-Erinnerungen: geplante Termine in den nächsten 24h, noch nicht erinnert ---
  let reminderQuery = supabase
    .from('candidate_appointments')
    .select('id, candidate_id, agency_id, type, scheduled_at, notes, created_at')
    .eq('status', 'geplant')
    .is('reminder_done_at', null)
    .gte('scheduled_at', nowIso)
    .lte('scheduled_at', reminderHorizon)
    .order('scheduled_at', { ascending: true })
    .limit(100);
  if (agencyIds) reminderQuery = reminderQuery.in('agency_id', agencyIds);

  // --- Kadenz fällig: aktiv und Versuch offen (next_at abgelaufen oder vom Cron bereits geleert) ---
  let cadenceQuery = supabase
    .from('candidates')
    .select('id, name, phone, agency_id, cadence_attempt, cadence_next_window, created_at')
    .eq('cadence_active', true)
    .or(`cadence_next_at.is.null,cadence_next_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(100);
  if (agencyIds) cadenceQuery = cadenceQuery.in('agency_id', agencyIds);

  // --- Rückrufe fällig ---
  let callbacksQuery = supabase
    .from('call_logs')
    .select('id, candidate_id, agency_id, notes, next_contact_date, created_at')
    .eq('next_step', 'erneut_anrufen')
    .lte('next_contact_date', todayStr)
    .order('next_contact_date', { ascending: true })
    .limit(100);
  if (agencyIds) callbacksQuery = callbacksQuery.in('agency_id', agencyIds);

  // --- Neue Bewerber ohne ersten Wählversuch ---
  let newQuery = supabase
    .from('candidates')
    .select('id, name, phone, agency_id, created_at')
    .is('first_dial_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (agencyIds) newQuery = newQuery.in('agency_id', agencyIds);

  const [reminderResult, cadenceResult, callbacksResult, newResult] = await Promise.all([
    reminderQuery,
    cadenceQuery,
    callbacksQuery,
    newQuery,
  ]);

  // Rückrufe: nur zählen, wenn der Rückruf-Log der jeweils letzte Anruf des Bewerbers ist
  // (sonst wurde der Rückruf bereits erledigt und neu protokolliert)
  const callbackLogs = callbacksResult.data ?? [];
  const callbackCandidateIds = [...new Set(callbackLogs.map((c) => c.candidate_id))];
  let latestLogPerCandidate: Record<string, string> = {};
  if (callbackCandidateIds.length > 0) {
    const { data: allLogs } = await supabase
      .from('call_logs')
      .select('id, candidate_id, created_at')
      .in('candidate_id', callbackCandidateIds)
      .order('created_at', { ascending: false });
    latestLogPerCandidate = {};
    for (const log of allLogs ?? []) {
      if (!latestLogPerCandidate[log.candidate_id]) {
        latestLogPerCandidate[log.candidate_id] = log.id;
      }
    }
  }
  const openCallbacks = callbackLogs.filter(
    (c) => latestLogPerCandidate[c.candidate_id] === c.id
  );

  // Kandidaten-Daten für Erinnerungen + Rückrufe auflösen
  const reminders = reminderResult.data ?? [];
  const extraCandidateIds = [
    ...new Set([
      ...reminders.map((r) => r.candidate_id),
      ...openCallbacks.map((c) => c.candidate_id),
    ]),
  ];
  const candidateInfo: Record<string, { name: string; phone: string | null; created_at: string }> = {};
  if (extraCandidateIds.length > 0) {
    const { data: extraCandidates } = await supabase
      .from('candidates')
      .select('id, name, phone, created_at')
      .in('id', extraCandidateIds);
    for (const c of extraCandidates ?? []) {
      candidateInfo[c.id] = { name: c.name, phone: c.phone, created_at: c.created_at };
    }
  }

  // --- Warteschlange aufbauen, Duplikate nach Priorität Erinnerung > Kadenz > Rückruf > Neu ---
  const queue = new Map<string, DialerQueueItem>();

  const emptyExtras = {
    cadence_attempt: null,
    cadence_window: null,
    callback_note: null,
    callback_date: null,
    appointment_id: null,
    appointment_type: null,
    appointment_at: null,
  };

  for (const r of reminders) {
    const info = candidateInfo[r.candidate_id];
    if (!info || queue.has(r.candidate_id)) continue;
    queue.set(r.candidate_id, {
      candidate_id: r.candidate_id,
      name: info.name,
      phone: info.phone,
      agency_id: r.agency_id,
      reason: 'erinnerung',
      ...emptyExtras,
      appointment_id: r.id,
      appointment_type: r.type as 'vorstellungsgespraech' | 'probetag',
      appointment_at: r.scheduled_at,
      created_at: info.created_at,
    });
  }

  for (const c of cadenceResult.data ?? []) {
    if (queue.has(c.id)) continue;
    queue.set(c.id, {
      candidate_id: c.id,
      name: c.name,
      phone: c.phone,
      agency_id: c.agency_id,
      reason: 'kadenz',
      ...emptyExtras,
      cadence_attempt: c.cadence_attempt ?? 0,
      cadence_window: c.cadence_next_window ?? null,
      created_at: c.created_at,
    });
  }

  for (const cb of openCallbacks) {
    if (queue.has(cb.candidate_id)) continue;
    const info = candidateInfo[cb.candidate_id];
    if (!info) continue;
    queue.set(cb.candidate_id, {
      candidate_id: cb.candidate_id,
      name: info.name,
      phone: info.phone,
      agency_id: cb.agency_id,
      reason: 'rueckruf',
      ...emptyExtras,
      callback_note: cb.notes,
      callback_date: cb.next_contact_date,
      created_at: info.created_at,
    });
  }

  for (const c of newResult.data ?? []) {
    if (queue.has(c.id)) continue;
    queue.set(c.id, {
      candidate_id: c.id,
      name: c.name,
      phone: c.phone,
      agency_id: c.agency_id,
      reason: 'neu',
      ...emptyExtras,
      created_at: c.created_at,
    });
  }

  const items = [...queue.values()];

  // Agentur-Infos (Name + Büro-Nummer) und Call-Skripte auflösen
  const queueAgencyIds = [...new Set(items.map((i) => i.agency_id))];
  const agencyMeta: Record<string, { name: string; outbound_phone: string | null }> = {};
  const scripts: Record<string, Record<string, string>> = {};
  if (queueAgencyIds.length > 0) {
    const [{ data: agencies }, { data: scriptRows }] = await Promise.all([
      supabase.from('agencies').select('id, name, outbound_phone').in('id', queueAgencyIds),
      supabase.from('call_scripts').select('agency_id, script_type, content').in('agency_id', queueAgencyIds),
    ]);
    for (const a of agencies ?? []) {
      agencyMeta[a.id] = { name: a.name, outbound_phone: a.outbound_phone ?? null };
    }
    for (const s of scriptRows ?? []) {
      if (!scripts[s.agency_id]) scripts[s.agency_id] = {};
      scripts[s.agency_id][s.script_type] = s.content;
    }
  }

  return NextResponse.json({
    queue: items,
    agencies: agencyMeta,
    scripts,
    stats: {
      total: items.length,
      erinnerungen: items.filter((i) => i.reason === 'erinnerung').length,
      kadenz: items.filter((i) => i.reason === 'kadenz').length,
      rueckrufe: items.filter((i) => i.reason === 'rueckruf').length,
      neue: items.filter((i) => i.reason === 'neu').length,
    },
  });
}
