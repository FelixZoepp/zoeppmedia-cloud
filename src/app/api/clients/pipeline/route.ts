import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { NextResponse } from 'next/server';

export type ClientPhase = 'onboarding' | 'kickoff' | 'fulfillment' | 'live' | 'betreuung';

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

    if (!agency.onboarding_completed) {
      phase = 'onboarding';
      days_in_phase = daysBetween(agency.created_at, now);
    } else if (total === 0 || done / total < 0.5) {
      phase = 'kickoff';
      // days since onboarding completed — approximate with created_at since we don't store completion date separately
      days_in_phase = daysBetween(agency.created_at, now);
    } else if (done / total < 1.0) {
      phase = 'fulfillment';
      days_in_phase = daysBetween(agency.created_at, now);
    } else if (candidate_count > 0) {
      // live or betreuung
      const daysLive = daysBetween(agency.created_at, now);
      if (daysLive > 14) {
        phase = 'betreuung';
      } else {
        phase = 'live';
      }
      days_in_phase = daysLive;
    } else {
      // All fulfillment done but no candidates yet — still show as fulfillment done
      phase = 'fulfillment';
      days_in_phase = daysBetween(agency.created_at, now);
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
