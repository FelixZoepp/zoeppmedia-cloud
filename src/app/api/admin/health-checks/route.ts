import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { NextResponse } from 'next/server';
import { runChecksForAgency } from '@/lib/health/run-checks';

export async function GET() {
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Get all active agencies
  const { data: agencies } = await admin
    .from('agencies')
    .select('id, name, status')
    .order('name');

  if (!agencies?.length) {
    return NextResponse.json([]);
  }

  // Get latest health check per agency per typ
  const { data: checks } = await admin
    .from('health_checks')
    .select('*')
    .order('gelaufen_am', { ascending: false });

  // Group by agency_id + typ, keep only latest per combination
  const latestMap = new Map<string, Record<string, unknown>>();
  for (const check of checks || []) {
    const key = `${check.agency_id}__${check.typ}`;
    if (!latestMap.has(key)) {
      latestMap.set(key, check);
    }
  }

  // Build response: per agency, group their checks
  const result = agencies.map((agency) => {
    const agencyChecks: Record<string, unknown>[] = [];
    for (const [key, check] of latestMap.entries()) {
      if (key.startsWith(`${agency.id}__`)) {
        agencyChecks.push(check);
      }
    }

    return {
      agency_id: agency.id,
      agency_name: agency.name,
      agency_status: agency.status,
      checks: agencyChecks,
    };
  });

  return NextResponse.json(result);
}

export async function POST(request: Request) {
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const { agency_id } = await request.json();
  if (!agency_id) {
    return NextResponse.json({ error: 'agency_id ist erforderlich' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get agency name
  const { data: agency } = await admin
    .from('agencies')
    .select('id, name')
    .eq('id', agency_id)
    .single();

  if (!agency) {
    return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
  }

  await runChecksForAgency(admin, agency.id, agency.name);

  return NextResponse.json({ success: true, message: `Health Checks fuer ${agency.name} ausgefuehrt` });
}
