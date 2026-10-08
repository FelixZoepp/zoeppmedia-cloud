import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { ladeArtikel, setzeFortschritt } from '@/lib/akademie/daten';

type Ctx = { params: Promise<{ slug: string }> };

/** POST { art: 'gelesen' | 'video' } – eigenen Fortschritt setzen (nur für sichtbare Artikel) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const { slug } = await params;
  const body = (await req.json().catch(() => ({}))) as { art?: unknown };
  if (body.art !== 'gelesen' && body.art !== 'video') return fehler('art muss gelesen oder video sein');
  if (!(await ladeArtikel(k.svc, slug, k.zugriff))) return fehler('Nicht gefunden', 404);
  await setzeFortschritt(k.svc, k.user.id, slug, body.art);
  return NextResponse.json({ ok: true });
}
