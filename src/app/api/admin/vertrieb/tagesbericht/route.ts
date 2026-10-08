import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfSalesControlling } from '@/lib/sales-controlling/zugriff';
import { ladeAnrufe, ladeClose, ladeProtokolle } from '@/lib/sales-controlling/quellen';
import { berechneTagesbericht, PROTOKOLL_TYPEN } from '@/lib/sales-controlling/tagesbericht';
import { berlinMitternacht, berlinTag } from '@/lib/zeit/berlin';

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

  const [y, m, d] = heute.split('-').map(Number);
  const tage = Array.from({ length: anzahl }, (_, i) => berlinTag(new Date(berlinMitternacht(y, m, d - i).getTime() + 12 * 3600_000)));
  const ab = berlinMitternacht(y, m, d - anzahl + 1).toISOString();
  // Statuswechsel weiter zurück, damit der Ausgangsstatus jedes Deals bekannt ist
  const historieAb = berlinMitternacht(y, m, d - anzahl - 200).toISOString();

  try {
    const [close, anrufe, protokolle, eintragungen] = await Promise.all([
      ladeClose(historieAb, () => []),
      ladeAnrufe(ab),
      ladeProtokolle(ab, Object.values(PROTOKOLL_TYPEN)).catch((err) => (console.error('[tagesbericht] Protokolle', err), null)),
      createAdminClient().from('sales_eintragungen').select('eingetragen_am, ergebnis').gte('eingetragen_am', ab),
    ]);
    const data = {
      ...berechneTagesbericht({
        tage,
        statuses: close.statuses,
        opps: close.opps,
        events: close.events,
        anrufe,
        protokolle: protokolle ?? [],
        eintragungen: (eintragungen.data ?? []) as Array<{ eingetragen_am: string; ergebnis: string }>,
        users: close.users,
      }),
      protokolleVerbunden: protokolle !== null,
      stand: new Date().toISOString(),
    };
    cache = { key, at: Date.now(), data };
    return NextResponse.json(data);
  } catch (err) {
    console.error('[tagesbericht]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Daten konnten nicht geladen werden' }, { status: 502 });
  }
}
