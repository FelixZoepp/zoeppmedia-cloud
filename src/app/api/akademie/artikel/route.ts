import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { slugify } from '@/lib/akademie/import';
import { istPosition } from '@/lib/akademie/positionen';

const schema = z.object({
  titel: z.string().min(3).max(140),
  typ: z.enum(['sop', 'skript', 'wissen', 'faq', 'rolle']),
  modul: z.string().min(2).max(60),
  positionen: z.array(z.string()).max(12).default([]),
});

/** POST – neuen Artikel als Entwurf anlegen (nur Admin) */
export async function POST(req: NextRequest) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fehler('Titel, Typ und Modul angeben');
  const { titel, typ, modul } = parsed.data;
  const positionen = parsed.data.positionen.filter(istPosition);
  const slug = `${slugify(titel) || 'artikel'}-${Date.now().toString(36)}`;
  const { error } = await k.svc.from('akademie_artikel').insert({
    slug,
    titel,
    typ,
    modul,
    positionen: positionen.length ? positionen : ['grundlagen'],
    status: 'entwurf',
    quelle: 'Von Hand angelegt',
    such_text: modul,
    bearbeitet_von: k.user.id,
    bearbeitet_am: new Date().toISOString(),
  });
  if (error) return fehler(error.message, 500);
  return NextResponse.json({ slug });
}
