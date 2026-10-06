import { NextRequest, NextResponse } from 'next/server';
import { darfSalesControlling } from '@/lib/sales-controlling/zugriff';
import { ladeSalesControlling, ZEITRÄUME, zeitraumFür, type Zeitraum } from '@/lib/sales-controlling/laden';

export const maxDuration = 60;

// Kurzzeit-Cache: Close/Meta nicht bei jedem Seitenaufruf komplett neu laden
let cache: { key: string; at: number; data: unknown } | null = null;

/** Sales-Controlling: Ziel 300k Auftragsvolumen/Monat, Marketing, Setting, Closing, Pipeline, Forecast */
export async function GET(req: NextRequest) {
  if (!(await darfSalesControlling())) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  if (!process.env.CLOSE_API_KEY) return NextResponse.json({ error: 'Close ist nicht verbunden (CLOSE_API_KEY fehlt)' }, { status: 503 });

  const gewählt = req.nextUrl.searchParams.get('zeitraum') ?? '';
  const z: Zeitraum = (ZEITRÄUME as readonly string[]).includes(gewählt) ? (gewählt as Zeitraum) : 'monat';
  const neu = req.nextUrl.searchParams.get('neu') === '1';
  const jetzt = new Date();
  const key = `${z}:${zeitraumFür(z, jetzt).von}`;
  if (!neu && cache && cache.key === key && Date.now() - cache.at < 5 * 60_000) return NextResponse.json(cache.data);

  try {
    const data = await ladeSalesControlling(z, jetzt);
    cache = { key, at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    console.error('[vertrieb]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Daten konnten nicht geladen werden' }, { status: 502 });
  }
}
