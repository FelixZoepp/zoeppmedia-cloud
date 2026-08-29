import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isAdmin } from '@/lib/admin';
import { NextResponse } from 'next/server';

export async function GET() {
  const supabase = await createServerClient();
  if (!(await isAdmin(supabase))) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  }

  const admin = createAdminClient();

  // Current month boundaries for "bezahlt diesen Monat"
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

  const [
    offeneResult,
    bezahltResult,
    fehlgeschlagenResult,
    mrrResult,
    rechnungenResult,
    mandateResult,
    plaeneResult,
    agenciesResult,
  ] = await Promise.all([
    // Offene Rechnungen: count + sum betrag_brutto
    admin
      .from('billing_runs')
      .select('id, betrag_brutto')
      .in('status', ['offen', 'rechnung_erstellt', 'zahlung_angestossen']),

    // Bezahlt diesen Monat
    admin
      .from('billing_runs')
      .select('id, betrag_brutto')
      .eq('status', 'bezahlt')
      .gte('bezahlt_am', monthStart)
      .lte('bezahlt_am', monthEnd),

    // Fehlgeschlagen
    admin
      .from('billing_runs')
      .select('id')
      .eq('status', 'fehlgeschlagen'),

    // MRR: sum betrag_netto from active monthly plans
    admin
      .from('billing_plans')
      .select('betrag_netto')
      .eq('status', 'aktiv')
      .eq('rhythmus', 'monatlich'),

    // All billing_runs with agency name
    admin
      .from('billing_runs')
      .select('*, agencies(id, name)')
      .order('erstellt_am', { ascending: false })
      .limit(200),

    // All mandates with agency name
    admin
      .from('mandates')
      .select('*, agencies(id, name)')
      .order('created_at', { ascending: false }),

    // All billing_plans with agency name
    admin
      .from('billing_plans')
      .select('*, agencies(id, name)')
      .order('created_at', { ascending: false }),

    // All agencies for dropdowns
    admin
      .from('agencies')
      .select('id, name')
      .order('name'),
  ]);

  // Calculate aggregates
  const offeneRows = offeneResult.data ?? [];
  const offeneBetrag = offeneRows.reduce((sum, r) => sum + Number(r.betrag_brutto || 0), 0);

  const bezahltRows = bezahltResult.data ?? [];
  const bezahltBetrag = bezahltRows.reduce((sum, r) => sum + Number(r.betrag_brutto || 0), 0);

  const mrrRows = mrrResult.data ?? [];
  const mrr = mrrRows.reduce((sum, r) => sum + Number(r.betrag_netto || 0), 0);

  return NextResponse.json({
    offene_rechnungen: { count: offeneRows.length, betrag: offeneBetrag },
    bezahlt_monat: { count: bezahltRows.length, betrag: bezahltBetrag },
    fehlgeschlagen: { count: (fehlgeschlagenResult.data ?? []).length },
    mrr,
    rechnungen: rechnungenResult.data ?? [],
    mandate: mandateResult.data ?? [],
    plaene: plaeneResult.data ?? [],
    agencies: agenciesResult.data ?? [],
  });
}
