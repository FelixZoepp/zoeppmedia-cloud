import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextResponse } from 'next/server';

// GET — list all agencies with billing summary
export async function GET() {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Fetch agencies, plans, mandates, and billing runs in parallel
  const [agenciesResult, plansResult, mandatesResult, runsResult] = await Promise.all([
    admin
      .from('agencies')
      .select('id, name, contact_name, email, phone, paket, mrr, rechtsform, created_at')
      .order('name'),
    admin
      .from('billing_plans')
      .select('id, agency_id, betrag_netto, status, rhythmus'),
    admin
      .from('mandates')
      .select('id, agency_id, status')
      .order('created_at', { ascending: false }),
    admin
      .from('billing_runs')
      .select('id, agency_id, status, betrag_netto'),
  ]);

  const agencies = agenciesResult.data ?? [];
  const plans = plansResult.data ?? [];
  const mandates = mandatesResult.data ?? [];
  const runs = runsResult.data ?? [];

  // Build a set of agency IDs that have billing data
  const agencyIdsWithBilling = new Set<string>();
  for (const p of plans) agencyIdsWithBilling.add(p.agency_id);
  for (const m of mandates) agencyIdsWithBilling.add(m.agency_id);
  for (const r of runs) agencyIdsWithBilling.add(r.agency_id);

  // Build mandate status map (latest mandate per agency)
  const mandateStatusMap = new Map<string, string>();
  for (const m of mandates) {
    // mandates are ordered by created_at desc, so first one per agency is latest
    if (!mandateStatusMap.has(m.agency_id)) {
      mandateStatusMap.set(m.agency_id, m.status);
    }
  }

  // Count open invoices per agency
  const openInvoicesMap = new Map<string, number>();
  for (const r of runs) {
    if (r.status === 'offen' || r.status === 'rechnung_erstellt' || r.status === 'zahlung_angestossen') {
      openInvoicesMap.set(r.agency_id, (openInvoicesMap.get(r.agency_id) ?? 0) + 1);
    }
  }

  // Count plans per agency
  const planCountMap = new Map<string, number>();
  for (const p of plans) {
    planCountMap.set(p.agency_id, (planCountMap.get(p.agency_id) ?? 0) + 1);
  }

  // Calculate total MRR from active retainer plans
  const mrrMap = new Map<string, number>();
  for (const p of plans) {
    if (p.status === 'aktiv' && p.rhythmus === 'monatlich') {
      mrrMap.set(p.agency_id, (mrrMap.get(p.agency_id) ?? 0) + (p.betrag_netto ?? 0));
    }
  }

  // Filter to only agencies with billing data, enrich with summary
  const customers = agencies
    .filter((a) => agencyIdsWithBilling.has(a.id))
    .map((a) => ({
      id: a.id,
      name: a.name,
      contact_name: a.contact_name,
      email: a.email,
      phone: a.phone,
      paket: a.paket,
      mrr: a.mrr ?? mrrMap.get(a.id) ?? 0,
      rechtsform: a.rechtsform,
      mandate_status: mandateStatusMap.get(a.id) ?? null,
      open_invoices: openInvoicesMap.get(a.id) ?? 0,
      plan_count: planCountMap.get(a.id) ?? 0,
      created_at: a.created_at,
    }));

  // Total MRR across all customers
  const totalMrr = customers.reduce((sum, c) => sum + (c.mrr ?? 0), 0);

  return NextResponse.json({ customers, total_mrr: totalMrr });
}
