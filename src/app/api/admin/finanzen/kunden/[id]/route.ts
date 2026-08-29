import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextRequest, NextResponse } from 'next/server';

// GET — single agency with all billing data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const admin = createAdminClient();

  const [agencyResult, plansResult, mandatesResult, runsResult] = await Promise.all([
    admin
      .from('agencies')
      .select('id, name, contact_name, email, phone, anschrift, rechnungsmail, ust_id, paket, mrr, rechtsform, onboarding_completed, created_at')
      .eq('id', id)
      .single(),
    admin
      .from('billing_plans')
      .select('*')
      .eq('agency_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('mandates')
      .select('*')
      .eq('agency_id', id)
      .order('created_at', { ascending: false }),
    admin
      .from('billing_runs')
      .select('*')
      .eq('agency_id', id)
      .order('erstellt_am', { ascending: false }),
  ]);

  if (!agencyResult.data) {
    return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
  }

  return NextResponse.json({
    agency: agencyResult.data,
    plans: plansResult.data ?? [],
    mandates: mandatesResult.data ?? [],
    billing_runs: runsResult.data ?? [],
  });
}

// PATCH — update agency fields
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const body = await request.json();
  const admin = createAdminClient();

  // Only allow specific fields to be updated
  const allowedFields = [
    'name', 'contact_name', 'email', 'phone', 'anschrift',
    'rechnungsmail', 'ust_id', 'paket', 'mrr', 'rechtsform',
  ];

  const updates: Record<string, unknown> = {};
  for (const field of allowedFields) {
    if (field in body) {
      updates[field] = body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'Keine gültigen Felder zum Aktualisieren' }, { status: 400 });
  }

  const { data, error } = await admin
    .from('agencies')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: `Fehler beim Aktualisieren: ${error.message}` }, { status: 500 });
  }

  return NextResponse.json(data);
}
