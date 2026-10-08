import { NextResponse } from 'next/server';
import { akademieKontext } from '@/lib/akademie/api';

/** GET – ausgewertete Gespräche (Fireflies) als Quelle für Wissen (nur Admin), beste zuerst */
export async function GET() {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { data } = await k.svc
    .from('gespraech_analysen')
    .select('fireflies_id, titel, datum, dauer_min, punkte')
    .order('punkte', { ascending: false, nullsFirst: false })
    .order('datum', { ascending: false })
    .limit(100);
  return NextResponse.json({ gespraeche: data ?? [] });
}
