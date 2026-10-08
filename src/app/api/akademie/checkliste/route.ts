import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { ladeArtikel } from '@/lib/akademie/daten';
import { checklisteVon } from '@/lib/akademie/bausteine';
import { kontextSauber, ladeCheckliste, speichereCheckliste } from '@/lib/akademie/checklisten';

/** GET ?slug=&kontext= – Checkliste (Baustein 3) und meine Haken für diesen Vorgang */
export async function GET(req: NextRequest) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const slug = req.nextUrl.searchParams.get('slug') ?? '';
  const kontext = kontextSauber(req.nextUrl.searchParams.get('kontext'));
  const a = await ladeArtikel(k.svc, slug, k.zugriff);
  if (!a) return fehler('Nicht gefunden', 404);
  return NextResponse.json({ punkte: checklisteVon(a), erledigt: await ladeCheckliste(k.svc, k.user.id, slug, kontext) });
}

/** POST { slug, kontext, erledigt: number[] } – Haken speichern */
export async function POST(req: NextRequest) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => ({}))) as { slug?: unknown; kontext?: unknown; erledigt?: unknown };
  const a = typeof body.slug === 'string' ? await ladeArtikel(k.svc, body.slug, k.zugriff) : null;
  if (!a) return fehler('Nicht gefunden', 404);
  try {
    return NextResponse.json(await speichereCheckliste(k.svc, k.user.id, a, kontextSauber(body.kontext), body.erledigt));
  } catch (err) {
    return fehler(err instanceof Error ? err.message : 'Fehler', 500);
  }
}
