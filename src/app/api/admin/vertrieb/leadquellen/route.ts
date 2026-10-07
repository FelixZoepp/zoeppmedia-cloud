import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfSalesControlling } from '@/lib/sales-controlling/zugriff';
import { trageLeadquellenNach } from '@/lib/sales/leadquellen-sync';

export const maxDuration = 120;

async function erlaubt(req: NextRequest): Promise<boolean> {
  const token = req.headers.get('x-sync-token');
  if (token) {
    const { data } = await createAdminClient().from('system_einstellungen').select('wert').eq('key', 'sync_token').maybeSingle();
    if ((data as { wert: string } | null)?.wert === token) return true;
  }
  return darfSalesControlling();
}

/** GET – Leads ohne Leadquelle (nur lesen) */
export async function GET(req: NextRequest) {
  if (!(await erlaubt(req))) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  try {
    const s = await trageLeadquellenNach({ schreiben: false });
    return NextResponse.json({ gesamt: s.gesamt, automatisch: s.gesetzt.length, ohneQuelle: s.ohneQuelle });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}

/** POST – fehlende Leadquellen bei Funnel-Leads aus den UTM-Daten setzen */
export async function POST(req: NextRequest) {
  if (!(await erlaubt(req))) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  try {
    return NextResponse.json(await trageLeadquellenNach());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
