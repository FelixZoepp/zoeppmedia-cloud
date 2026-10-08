import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { ladeArtikel } from '@/lib/akademie/daten';
import { reviewVon } from '@/lib/akademie/bausteine';
import { kontextSauber, ladeReview, speichereReview } from '@/lib/akademie/checklisten';

/** GET ?slug=&kontext= – Review-Checkliste (Baustein 4) und mein Stand */
export async function GET(req: NextRequest) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const slug = req.nextUrl.searchParams.get('slug') ?? '';
  const a = await ladeArtikel(k.svc, slug, k.zugriff);
  if (!a) return fehler('Nicht gefunden', 404);
  return NextResponse.json({ punkte: reviewVon(a), review: await ladeReview(k.svc, k.user.id, slug, kontextSauber(req.nextUrl.searchParams.get('kontext'))) });
}

/** POST { slug, kontext, erledigt, notiz?, zurPruefung? } – Selbstcheck speichern bzw. zur Prüfung geben */
export async function POST(req: NextRequest) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => ({}))) as { slug?: unknown; kontext?: unknown; erledigt?: unknown; notiz?: unknown; zurPruefung?: unknown };
  const a = typeof body.slug === 'string' ? await ladeArtikel(k.svc, body.slug, k.zugriff) : null;
  if (!a) return fehler('Nicht gefunden', 404);
  try {
    return NextResponse.json({ review: await speichereReview(k.svc, k.user.id, a, kontextSauber(body.kontext), body) });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : 'Fehler', 500);
  }
}
