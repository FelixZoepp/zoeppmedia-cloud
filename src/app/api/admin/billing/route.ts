import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';

// GET — list billing plans, runs, mandates for an agency
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const agencyId = request.nextUrl.searchParams.get('agency_id');
  if (!agencyId) {
    return NextResponse.json({ error: 'agency_id ist erforderlich' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch plans, runs, mandates in parallel
  const [plansResult, runsResult, mandatesResult] = await Promise.all([
    admin
      .from('billing_plans')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false }),
    admin
      .from('billing_runs')
      .select('*')
      .eq('agency_id', agencyId)
      .order('erstellt_am', { ascending: false })
      .limit(50),
    admin
      .from('mandates')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false }),
  ]);

  return NextResponse.json({
    plans: plansResult.data ?? [],
    runs: runsResult.data ?? [],
    mandates: mandatesResult.data ?? [],
  });
}

// POST — create a billing plan for an agency
export async function POST(request: NextRequest) {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const body = await request.json();

  const {
    agency_id,
    typ,
    betrag_netto,
    ust_satz,
    rhythmus,
    faelligkeitstag,
    start_datum,
    ende_datum,
  } = body;

  // Validation
  if (!agency_id || !typ || betrag_netto == null || !rhythmus || !start_datum) {
    return NextResponse.json(
      { error: 'Pflichtfelder: agency_id, typ, betrag_netto, rhythmus, start_datum' },
      { status: 400 }
    );
  }

  if (!['setup', 'retainer'].includes(typ)) {
    return NextResponse.json({ error: 'typ muss "setup" oder "retainer" sein' }, { status: 400 });
  }

  if (!['einmalig', 'monatlich'].includes(rhythmus)) {
    return NextResponse.json({ error: 'rhythmus muss "einmalig" oder "monatlich" sein' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Verify agency exists
  const { data: agency } = await admin
    .from('agencies')
    .select('id')
    .eq('id', agency_id)
    .single();

  if (!agency) {
    return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
  }

  const { data: plan, error } = await admin
    .from('billing_plans')
    .insert({
      agency_id,
      typ,
      betrag_netto,
      ust_satz: ust_satz ?? 19.0,
      rhythmus,
      faelligkeitstag: faelligkeitstag ?? 1,
      start_datum,
      ende_datum: ende_datum ?? null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: `Plan konnte nicht erstellt werden: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json(plan, { status: 201 });
}
