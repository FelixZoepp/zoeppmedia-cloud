import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { istPosition } from '@/lib/akademie/positionen';
import { suchTextVon, type Artikel } from '@/lib/akademie/daten';

type Ctx = { params: Promise<{ position: string }> };
const PLATZHALTER = 'Felix ergänzt';

/**
 * POST (Admin) { mitPlatzhaltern?: boolean } – alle Entwürfe einer Bereichs-Akademie freigeben.
 * Standard: Artikel mit offenen „Felix ergänzt“-Platzhaltern bleiben Entwurf.
 */
export async function POST(req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { position } = await params;
  if (!istPosition(position)) return fehler('Unbekannter Bereich', 404);
  const body = (await req.json().catch(() => ({}))) as { mitPlatzhaltern?: unknown };
  const { data, error } = await k.svc
    .from('akademie_artikel')
    .select('slug, modul, zusammenfassung, abschnitte, inhalt, ergaenzt_slug')
    .eq('status', 'entwurf')
    .contains('positionen', [position]);
  if (error) return fehler(error.message, 500);
  const entwuerfe = ((data ?? []) as Array<Pick<Artikel, 'slug' | 'modul' | 'zusammenfassung' | 'abschnitte' | 'inhalt' | 'ergaenzt_slug'>>).filter((a) => !a.ergaenzt_slug);
  const frei = entwuerfe.filter((a) => body.mitPlatzhaltern === true || !suchTextVon(a).includes(PLATZHALTER));
  if (frei.length) {
    const jetzt = new Date().toISOString();
    const { error: e } = await k.svc
      .from('akademie_artikel')
      .update({ status: 'freigegeben', bearbeitet_von: k.user.id, bearbeitet_am: jetzt, updated_at: jetzt })
      .in('slug', frei.map((a) => a.slug));
    if (e) return fehler(e.message, 500);
  }
  return NextResponse.json({ freigegeben: frei.length, mitPlatzhalternOffen: entwuerfe.length - frei.length });
}
