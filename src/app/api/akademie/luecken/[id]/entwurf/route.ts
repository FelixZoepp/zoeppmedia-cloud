import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { erzeugeEntwuerfe } from '@/lib/akademie/import';

export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

/** POST { notiz? } – aus einer Wissenslücke einen Artikel-Entwurf erzeugen (nur Admin) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { notiz?: unknown };
  const notiz = typeof body.notiz === 'string' ? body.notiz.trim().slice(0, 20_000) : '';
  const { data } = await k.svc.from('akademie_luecken').select('id, frage, anzahl, positionen').eq('id', id).maybeSingle();
  const l = data as { id: string; frage: string; anzahl: number; positionen: string[] } | null;
  if (!l) return fehler('Nicht gefunden', 404);
  const text = [
    `Mitarbeiter haben ${l.anzahl}× gefragt: „${l.frage}“`,
    l.positionen.length ? `Fragende Positionen: ${l.positionen.join(', ')}` : '',
    notiz ? `Antwort/Wissen des Inhabers dazu:\n${notiz}` : 'Der Inhaber hat noch keine Antwort geliefert – erstelle ein Gerüst mit Leitfragen („Felix ergänzt: …“), erfinde keine Fakten.',
  ]
    .filter(Boolean)
    .join('\n\n');
  try {
    const { slugs } = await erzeugeEntwuerfe(k.svc, { art: 'luecke', titel: l.frage.slice(0, 120), text, erstelltVon: k.user.id });
    await k.svc.from('akademie_luecken').update({ artikel_slug: slugs[0] ?? null, status: 'erledigt' }).eq('id', id);
    return NextResponse.json({ slugs });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : 'Fehler', 422);
  }
}
