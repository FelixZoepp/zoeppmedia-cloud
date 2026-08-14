import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { NextResponse } from 'next/server';

export type ClientPhase = 'onboarding_termin' | 'onboarding_formular' | 'fulfillment' | 'kampagne_live' | 'kickoff_14d' | 'bestandskunde';

export interface PipelineClient {
  id: string;
  name: string;
  contact_name: string;
  created_at: string;
  onboarding_completed: boolean;
  fulfillment_total: number;
  fulfillment_done: number;
  candidate_count: number;
  last_login: string | null;
  phase: ClientPhase;
  days_in_phase: number;
}

function daysBetween(from: string, to: Date): number {
  return Math.floor((to.getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24));
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();
  const supabase = await createServerClient();
  const now = new Date();

  // For employees: only their assigned agencies. For admins: all.
  let agencyIds: string[] | null = null;
  if (user.role === 'employee') {
    const { data: assignments } = await supabase
      .from('employee_assignments')
      .select('agency_id')
      .eq('employee_id', user.id);
    agencyIds = (assignments ?? []).map((a) => a.agency_id);
    if (agencyIds.length === 0) {
      return NextResponse.json([]);
    }
  }

  // Fetch agencies
  let agencyQuery = admin
    .from('agencies')
    .select('id, name, contact_name, created_at, onboarding_completed')
    .order('created_at', { ascending: false });

  if (agencyIds !== null) {
    agencyQuery = agencyQuery.in('id', agencyIds);
  }

  const { data: agencies } = await agencyQuery;
  if (!agencies || agencies.length === 0) return NextResponse.json([]);

  const ids = agencies.map((a) => a.id);

  // Fulfillment tasks per agency
  const { data: fulfillmentTasks } = await admin
    .from('fulfillment_tasks')
    .select('agency_id, status')
    .in('agency_id', ids);

  const fulfillmentMap: Record<string, { total: number; done: number }> = {};
  (fulfillmentTasks ?? []).forEach((t) => {
    if (!fulfillmentMap[t.agency_id]) fulfillmentMap[t.agency_id] = { total: 0, done: 0 };
    fulfillmentMap[t.agency_id].total += 1;
    if (t.status === 'done' || t.status === 'skipped') {
      fulfillmentMap[t.agency_id].done += 1;
    }
  });

  // Candidate counts per agency
  const { data: candidates } = await admin
    .from('candidates')
    .select('agency_id')
    .in('agency_id', ids);

  const candidateMap: Record<string, number> = {};
  (candidates ?? []).forEach((c) => {
    candidateMap[c.agency_id] = (candidateMap[c.agency_id] || 0) + 1;
  });

  // Last login per agency (from users table)
  const { data: users } = await admin
    .from('users')
    .select('agency_id, last_login')
    .in('agency_id', ids)
    .order('last_login', { ascending: false });

  const loginMap: Record<string, string | null> = {};
  (users ?? []).forEach((u) => {
    if (!loginMap[u.agency_id] && u.last_login) {
      loginMap[u.agency_id] = u.last_login;
    }
  });

  const result: PipelineClient[] = agencies.map((agency) => {
    const { total = 0, done = 0 } = fulfillmentMap[agency.id] ?? {};
    const candidate_count = candidateMap[agency.id] ?? 0;
    const last_login = loginMap[agency.id] ?? null;

    let phase: ClientPhase;
    let days_in_phase: number;

    // Phase logic:
    // 1. Onboarding Termin — fresh agency, not yet onboarded
    // 2. Onboarding Formular — registered but form not completed
    // 3. Fulfillment — onboarding done, content being created
    // 4. Kampagne Live — all fulfillment done, campaign running (< 14 days)
    // 5. Kickoff 14d — campaign running for 14+ days, first review
    // 6. Bestandskunde — ongoing, bi-weekly check-ins

    const daysActive = daysBetween(agency.created_at, now);

    if (!agency.onboarding_completed && !last_login) {
      // Never logged in — waiting for onboarding termin
      phase = 'onboarding_termin';
      days_in_phase = daysActive;
    } else if (!agency.onboarding_completed) {
      // Logged in but hasn't completed the form
      phase = 'onboarding_formular';
      days_in_phase = daysActive;
    } else if (total === 0 || done < total) {
      // Onboarding done, fulfillment tasks not all complete
      phase = 'fulfillment';
      days_in_phase = daysActive;
    } else if (candidate_count === 0) {
      // All tasks done but no candidates yet — campaign just starting
      phase = 'kampagne_live';
      days_in_phase = 0;
    } else if (daysActive < 14) {
      // Campaign running, within first 14 days
      phase = 'kampagne_live';
      days_in_phase = daysActive;
    } else if (daysActive < 28) {
      // 14+ days — kickoff phase (first review)
      phase = 'kickoff_14d';
      days_in_phase = daysActive - 14;
    } else {
      // 28+ days — Bestandskunde, bi-weekly check-ins
      phase = 'bestandskunde';
      days_in_phase = daysActive;
    }

    return {
      id: agency.id,
      name: agency.name,
      contact_name: agency.contact_name,
      created_at: agency.created_at,
      onboarding_completed: agency.onboarding_completed ?? false,
      fulfillment_total: total,
      fulfillment_done: done,
      candidate_count,
      last_login,
      phase,
      days_in_phase,
    };
  });

  return NextResponse.json(result);
}
