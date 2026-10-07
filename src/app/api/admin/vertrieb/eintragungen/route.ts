import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfSalesControlling } from '@/lib/sales-controlling/zugriff';
import { ZEITRÄUME, zeitraumFür, type Zeitraum } from '@/lib/sales-controlling/laden';
import { eintragungsZahlen, type Ergebnis } from '@/lib/sales/eintragungen';

/** GET ?zeitraum= – Eintragungen: direkt gebucht, kein Termin nach 10 Min., später gebucht */
export async function GET(req: NextRequest) {
  if (!(await darfSalesControlling())) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const g = req.nextUrl.searchParams.get('zeitraum') ?? '';
  const z: Zeitraum = (ZEITRÄUME as readonly string[]).includes(g) ? (g as Zeitraum) : 'monat';
  const { von, bis } = zeitraumFür(z, new Date());
  const { data } = await createAdminClient()
    .from('sales_eintragungen')
    .select('lead_id, name, quelle, eingetragen_am, gebucht_am, ergebnis, anruf_aufgabe_am')
    .gte('eingetragen_am', von)
    .lt('eingetragen_am', bis)
    .order('eingetragen_am', { ascending: false });
  const rows = (data ?? []) as Array<{ lead_id: string; name: string | null; quelle: string | null; eingetragen_am: string; gebucht_am: string | null; ergebnis: Ergebnis; anruf_aufgabe_am: string | null }>;
  return NextResponse.json({ zahlen: eintragungsZahlen(rows), offen: rows.filter((r) => r.ergebnis === 'nicht_gebucht').slice(0, 20) });
}
