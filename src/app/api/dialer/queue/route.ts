import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dialerScope } from '@/lib/dialer/scope';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';

// Interne Sales-Agentur (Sales-WhatsApp-Kontakte) sind keine Bewerber
const NICHT_INTERN = `(${HIDDEN_AGENCY_IDS.join(',')})`;
import {
  baueWarteschlange,
  offeneRueckrufe,
  queueStats,
  type QueueCallback,
  type QueueCandidate,
  type QueueReminder,
} from '@/lib/dialer/queue';

export type { DialerQueueItem } from '@/lib/dialer/queue';

const KANDIDAT_FELDER =
  'id, name, phone, agency_id, created_at, cadence_attempt, cadence_next_window, blacklisted, deleted_at, do_not_contact, locked_by, locked_until';

/**
 * Anruf-Modus: Call-Warteschlange.
 * - Kunden-Cloud (Kunde oder Innendienst per Kunden-Login): nur dieser Kunde
 * - interner Dialer (?modus=intern): alle bzw. zugeordnete Kunden
 * Quellen: Termin-Erinnerungen (VG/Probetag in <24h), fällige Kadenz-Anrufe,
 * Rückrufe (call_logs), neue ungewählte Bewerber.
 */
export async function GET(req: NextRequest) {
  const svc = createAdminClient();
  const scope = await dialerScope(svc, { intern: req.nextUrl.searchParams.get('modus') === 'intern' });
  if (!scope) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const leer = { queue: [], agencies: {}, scripts: {}, stats: queueStats([]), einKunde: scope.einKunde, schreiben: scope.schreiben };
  if (scope.agencyIds && scope.agencyIds.length === 0) return NextResponse.json(leer);

  const ids = scope.agencyIds;
  const now = new Date();
  const nowIso = now.toISOString();
  const todayStr = nowIso.slice(0, 10);
  const reminderHorizon = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

  let reminderQuery = svc
    .from('candidate_appointments')
    .select('id, candidate_id, agency_id, type, scheduled_at')
    .eq('status', 'geplant')
    .is('reminder_done_at', null)
    .gte('scheduled_at', nowIso)
    .lte('scheduled_at', reminderHorizon)
    .order('scheduled_at', { ascending: true })
    .limit(100);
  if (ids) reminderQuery = reminderQuery.in('agency_id', ids);
  else reminderQuery = reminderQuery.not('agency_id', 'in', NICHT_INTERN);

  // Kadenz: aktiv und Versuch offen (next_at abgelaufen oder vom Cron bereits geleert)
  let cadenceQuery = svc
    .from('candidates')
    .select(KANDIDAT_FELDER)
    .eq('cadence_active', true)
    .or(`cadence_next_at.is.null,cadence_next_at.lte.${nowIso}`)
    .order('created_at', { ascending: true })
    .limit(100);
  if (ids) cadenceQuery = cadenceQuery.in('agency_id', ids);
  else cadenceQuery = cadenceQuery.not('agency_id', 'in', NICHT_INTERN);

  let callbacksQuery = svc
    .from('call_logs')
    .select('id, candidate_id, agency_id, notes, next_contact_date')
    .eq('next_step', 'erneut_anrufen')
    .lte('next_contact_date', todayStr)
    .order('next_contact_date', { ascending: true })
    .limit(100);
  if (ids) callbacksQuery = callbacksQuery.in('agency_id', ids);
  else callbacksQuery = callbacksQuery.not('agency_id', 'in', NICHT_INTERN);

  // Neue Bewerber ohne ersten Wählversuch – neueste zuerst (Speed-to-Lead)
  let newQuery = svc
    .from('candidates')
    .select(KANDIDAT_FELDER)
    .is('first_dial_at', null)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (ids) newQuery = newQuery.in('agency_id', ids);
  else newQuery = newQuery.not('agency_id', 'in', NICHT_INTERN);

  const [reminderResult, cadenceResult, callbacksResult, newResult] = await Promise.all([
    reminderQuery,
    cadenceQuery,
    callbacksQuery,
    newQuery,
  ]);

  const callbacks = (callbacksResult.data ?? []) as QueueCallback[];
  const reminders = (reminderResult.data ?? []) as QueueReminder[];

  // Rückrufe nur, wenn der Rückruf-Log der jeweils letzte Anruf des Bewerbers ist
  const letzterLog: Record<string, string> = {};
  const callbackIds = [...new Set(callbacks.map((c) => c.candidate_id))];
  if (callbackIds.length) {
    const { data: logs } = await svc
      .from('call_logs')
      .select('id, candidate_id, created_at')
      .in('candidate_id', callbackIds)
      .order('created_at', { ascending: false });
    for (const log of (logs ?? []) as Array<{ id: string; candidate_id: string }>) {
      if (!letzterLog[log.candidate_id]) letzterLog[log.candidate_id] = log.id;
    }
  }
  const offen = offeneRueckrufe(callbacks, letzterLog);

  const extraIds = [...new Set([...reminders.map((r) => r.candidate_id), ...offen.map((c) => c.candidate_id)])];
  const kandidaten: Record<string, QueueCandidate> = {};
  if (extraIds.length) {
    const { data } = await svc.from('candidates').select(KANDIDAT_FELDER).in('id', extraIds);
    for (const c of (data ?? []) as QueueCandidate[]) kandidaten[c.id] = c;
  }

  const items = baueWarteschlange({
    reminders,
    cadence: (cadenceResult.data ?? []) as QueueCandidate[],
    callbacks: offen,
    neue: (newResult.data ?? []) as QueueCandidate[],
    kandidaten,
    userId: scope.user.id,
    jetzt: now,
  });

  // Agentur-Infos (Name + Büro-Nummer) und Call-Skripte
  const queueAgencyIds = [...new Set([...items.map((i) => i.agency_id), ...(ids ?? [])])];
  const agencies: Record<string, { name: string; outbound_phone: string | null }> = {};
  const scripts: Record<string, Record<string, string>> = {};
  if (queueAgencyIds.length) {
    const [{ data: ags }, { data: scriptRows }] = await Promise.all([
      svc.from('agencies').select('id, name, outbound_phone').in('id', queueAgencyIds),
      svc.from('call_scripts').select('agency_id, script_type, content').in('agency_id', queueAgencyIds),
    ]);
    for (const a of (ags ?? []) as Array<{ id: string; name: string; outbound_phone: string | null }>) {
      agencies[a.id] = { name: a.name, outbound_phone: a.outbound_phone ?? null };
    }
    for (const s of (scriptRows ?? []) as Array<{ agency_id: string; script_type: string; content: string }>) {
      (scripts[s.agency_id] ??= {})[s.script_type] = s.content;
    }
  }

  return NextResponse.json({ ...leer, queue: items, agencies, scripts, stats: queueStats(items) });
}
