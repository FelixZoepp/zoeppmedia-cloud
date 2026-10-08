import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { uebernehmeErgaenzung } from '@/lib/akademie/import';

type Ctx = { params: Promise<{ slug: string }> };

/** POST – Ergänzungs-Entwurf in den Ziel-Artikel übernehmen (nur Admin) */
export async function POST(_req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { slug } = await params;
  try {
    const ziel = await uebernehmeErgaenzung(k.svc, slug, k.user.id);
    return NextResponse.json({ ok: true, ziel });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : 'Fehler');
  }
}
