import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';

/** Cash-Plan: Ausgaben (Kartenumsätze) + feste Kosten (nur Admins) */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const svc = createAdminClient();
  const seit = new Date();
  seit.setMonth(seit.getMonth() - 18);
  const [a, f] = await Promise.all([
    svc.from('finanz_ausgaben').select('id, datum, haendler, betrag, kategorie, privat, quelle').gte('datum', seit.toISOString().slice(0, 10)).order('datum', { ascending: false }).limit(5000),
    svc.from('finanz_fixkosten').select('id, name, kategorie, monatlich, ab, bis, notiz, nur_planung').order('monatlich', { ascending: false }),
  ]);
  if (a.error || f.error) return NextResponse.json({ error: (a.error ?? f.error)!.message }, { status: 500 });
  return NextResponse.json({
    ausgaben: (a.data ?? []).map((x) => ({ ...x, betrag: Number(x.betrag) })),
    fixkosten: (f.data ?? []).map((x) => ({ ...x, monatlich: Number(x.monatlich) })),
  });
}
