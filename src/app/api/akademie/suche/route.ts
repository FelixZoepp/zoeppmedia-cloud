import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext } from '@/lib/akademie/api';
import { sucheArtikel } from '@/lib/akademie/daten';

/** GET ?q= – Volltextsuche, nur sichtbare Artikel */
export async function GET(req: NextRequest) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const q = req.nextUrl.searchParams.get('q') ?? '';
  const treffer = await sucheArtikel(k.svc, k.zugriff, q, 20);
  return NextResponse.json({ treffer: treffer.map((a) => ({ slug: a.slug, titel: a.titel, typ: a.typ, modul: a.modul, zusammenfassung: a.zusammenfassung, status: a.status })) });
}
