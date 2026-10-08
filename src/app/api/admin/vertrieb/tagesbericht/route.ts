import { NextRequest, NextResponse } from 'next/server';
import { darfSalesControlling } from '@/lib/sales-controlling/zugriff';
import { ladeTagesbericht, tageZwischen } from '@/lib/sales-controlling/tagesbericht-laden';
import { berlinTag } from '@/lib/zeit/berlin';

export const maxDuration = 60;

let cache: { key: string; at: number; data: unknown } | null = null;

/** GET ?tage=14 – Tagesbericht Vertrieb (ersetzt Make → Monday): Akquise, Pipeline, Marketing je Tag */
export async function GET(req: NextRequest) {
  if (!(await darfSalesControlling())) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  if (!process.env.CLOSE_API_KEY) return NextResponse.json({ error: 'Close ist nicht verbunden (CLOSE_API_KEY fehlt)' }, { status: 503 });

  const anzahl = Math.min(62, Math.max(1, Number(req.nextUrl.searchParams.get('tage')) || 14));
  const neu = req.nextUrl.searchParams.get('neu') === '1';
  const heute = berlinTag();
  const key = `${anzahl}:${heute}`;
  if (!neu && cache && cache.key === key && Date.now() - cache.at < 5 * 60_000) return NextResponse.json(cache.data);

  const tage = tageZwischen(new Date(new Date(`${heute}T12:00:00Z`).getTime() - (anzahl - 1) * 864e5).toISOString().slice(0, 10), heute);
  try {
    const data = { ...(await ladeTagesbericht(tage)), stand: new Date().toISOString() };
    cache = { key, at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    console.error('[tagesbericht]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Daten konnten nicht geladen werden' }, { status: 502 });
  }
}
