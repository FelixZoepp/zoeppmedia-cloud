import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();

  // 1. Get employee's assigned agency_ids
  const { data: assignments } = await supabase
    .from('employee_assignments')
    .select('agency_id')
    .eq('employee_id', user.id);

  const agencyIds = (assignments ?? []).map((a) => a.agency_id);

  // 2. Get agency details for enriching task data
  let agencies: { id: string; name: string }[] = [];
  if (agencyIds.length > 0) {
    const { data } = await supabase
      .from('agencies')
      .select('id, name')
      .in('id', agencyIds);
    agencies = data ?? [];
  }

  const agencyNameMap: Record<string, string> = {};
  for (const a of agencies) {
    agencyNameMap[a.id] = a.name;
  }

  // 3. Fulfillment tasks: agency_id IN assigned AND status != 'done'
  let fulfillment: unknown[] = [];
  if (agencyIds.length > 0) {
    const { data } = await supabase
      .from('fulfillment_tasks')
      .select('*')
      .in('agency_id', agencyIds)
      .neq('status', 'done')
      .order('sort_order', { ascending: true });

    fulfillment = (data ?? []).map((t) => ({
      ...t,
      agency_name: agencyNameMap[t.agency_id] ?? 'Unbekannt',
    }));
  }

  // 4. Playbook tasks: status IN ('pending', 'in_progress')
  const [pendingRes, inProgressRes] = await Promise.all([
    supabase
      .from('playbook_tasks')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: false }),
    supabase
      .from('playbook_tasks')
      .select('*')
      .eq('status', 'in_progress')
      .order('created_at', { ascending: false }),
  ]);

  const playbookRaw = [
    ...(inProgressRes.data ?? []),
    ...(pendingRes.data ?? []),
  ];

  // Enrich playbook tasks with agency names
  const playbookAgencyIds = [...new Set(playbookRaw.map((t) => t.agency_id).filter(Boolean))] as string[];
  let playbookAgencyNames: Record<string, string> = { ...agencyNameMap };
  if (playbookAgencyIds.some((id) => !playbookAgencyNames[id])) {
    const missingIds = playbookAgencyIds.filter((id) => !playbookAgencyNames[id]);
    const { data } = await supabase
      .from('agencies')
      .select('id, name')
      .in('id', missingIds);
    for (const a of data ?? []) {
      playbookAgencyNames[a.id] = a.name;
    }
  }

  const playbook = playbookRaw.map((t) => ({
    ...t,
    agency_name: t.agency_id ? (playbookAgencyNames[t.agency_id] ?? 'Unbekannt') : null,
  }));

  // 5. Recurring tasks: agency_id IN assigned AND status = 'pending'
  let recurring: unknown[] = [];
  if (agencyIds.length > 0) {
    const { data } = await supabase
      .from('recurring_fulfillment_tasks')
      .select('*')
      .in('agency_id', agencyIds)
      .eq('status', 'pending')
      .order('due_date', { ascending: true });

    recurring = (data ?? []).map((t) => ({
      ...t,
      agency_name: agencyNameMap[t.agency_id] ?? 'Unbekannt',
    }));
  }

  return NextResponse.json({
    fulfillment,
    playbook,
    recurring,
    agencies,
  });
}
