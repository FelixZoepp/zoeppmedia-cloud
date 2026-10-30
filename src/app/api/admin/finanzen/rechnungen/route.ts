import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { LETZTER_ABGLEICH_KEY } from '@/lib/finanzen/lexware-abgleich';

/** Cash-Plan: Rechnungen aus Lexware (nur Admins) + Stand des letzten Abgleichs */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const svc = createAdminClient();
  const [{ data, error }, { data: stand }] = await Promise.all([
    svc
      .from('finanz_rechnungen')
      .select('voucher_id, nummer, contact_id, kontakt, datum, faellig, brutto, netto, offen, status, bezahlt_am')
      .neq('status', 'voided')
      .order('datum', { ascending: false })
      .limit(2000),
    svc.from('system_einstellungen').select('wert').eq('key', LETZTER_ABGLEICH_KEY).maybeSingle(),
  ]);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  let abgleich: unknown = null;
  try {
    abgleich = stand?.wert ? JSON.parse(String(stand.wert)) : null;
  } catch {
    abgleich = null;
  }
  const zahl = (x: unknown) => (x == null ? null : Number(x));
  return NextResponse.json({
    rechnungen: (data ?? []).map((r) => ({ ...r, brutto: zahl(r.brutto), netto: zahl(r.netto), offen: zahl(r.offen) })),
    abgleich,
  });
}
