import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

export const maxDuration = 300;

/**
 * POST { aktion: 'nachholen' | 'feedback', tage? } – vom Tick (Jobs gespraeche.nachholen / marketing.feedback) mit CRON_SECRET.
 * nachholen: Close-Telefonate (Setting/Verkauf) an Fireflies geben + fehlende Fireflies-Gespräche analysieren.
 * feedback: Marketing-Auswertung aus den Gesprächen der letzten Tage. Antwortet sofort, gearbeitet wird per after().
 */
export async function POST(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  }
  const b = (await req.json().catch(() => ({}))) as { aktion?: string; tage?: number };
  const svc = createAdminClient();

  if (b.aktion === 'nachholen') {
    const tage = Math.min(30, Math.max(1, Number(b.tage) || 2));
    const seit = new Date(Date.now() - tage * 864e5);
    after(async () => {
      try {
        const { ladeAnrufe, schickeAnruf } = await import('@/lib/gespraeche/close-anrufe');
        for (const c of (await ladeAnrufe(seit)).slice(0, 30)) await schickeAnruf(svc, c);
        const { listeTranskripte } = await import('@/lib/gespraeche/fireflies');
        const { verarbeiteGespraech } = await import('@/lib/gespraeche/analyse');
        const liste = await listeTranskripte(seit, 30);
        const { data: da } = await svc.from('gespraech_analysen').select('fireflies_id, status').in('fireflies_id', liste.map((t) => t.id));
        const fertig = new Set(
          ((da ?? []) as Array<{ fireflies_id: string; status: string }>).filter((x) => x.status === 'in_close' || x.status === 'uebersprungen').map((x) => x.fireflies_id),
        );
        for (const t of liste.filter((x) => !fertig.has(x.id)).slice(0, 8)) await verarbeiteGespraech(svc, t.id);
      } catch (err) {
        console.error('[gespraeche] Nachholen fehlgeschlagen:', err);
      }
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  if (b.aktion === 'feedback') {
    const tage = Math.min(60, Math.max(1, Number(b.tage) || 7));
    after(async () => {
      try {
        const { erstelleMarketingFeedback } = await import('@/lib/gespraeche/marketing');
        await erstelleMarketingFeedback(svc, tage);
      } catch (err) {
        console.error('[gespraeche] Marketing-Feedback fehlgeschlagen:', err);
      }
    });
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  return NextResponse.json({ error: 'Unbekannte Aktion' }, { status: 400 });
}
