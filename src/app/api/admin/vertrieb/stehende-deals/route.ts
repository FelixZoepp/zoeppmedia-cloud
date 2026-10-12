import { NextResponse } from 'next/server';
import { darfSalesControlling } from '@/lib/sales-controlling/zugriff';
import { ladeStehendeDeals } from '@/lib/sales/stehende-deals';

export const maxDuration = 120;

/** GET – aktive Deals ohne Bewegung seit 7+ Tagen (live aus Close, nur lesen) */
export async function GET() {
  if (!(await darfSalesControlling())) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  try {
    return NextResponse.json(await ladeStehendeDeals());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Close nicht erreichbar' }, { status: 502 });
  }
}
