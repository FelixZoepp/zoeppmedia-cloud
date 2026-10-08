import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { ARTIKEL_SPALTEN, ladeArtikel, suchTextVon, type Artikel } from '@/lib/akademie/daten';
import { istPosition } from '@/lib/akademie/positionen';

type Ctx = { params: Promise<{ slug: string }> };

/** GET – ein Artikel, nur wenn sichtbar (sonst 404, auch für Entwürfe) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const { slug } = await params;
  const a = await ladeArtikel(k.svc, slug, k.zugriff);
  if (!a) return fehler('Nicht gefunden', 404);
  return NextResponse.json({ artikel: a, admin: k.zugriff.admin });
}

const listen = z.array(z.string().max(600)).max(40);
const patchSchema = z
  .object({
    titel: z.string().min(3).max(140),
    modul: z.string().min(2).max(60),
    positionen: z.array(z.string()).max(12),
    step_keys: z.array(z.string().max(60)).max(30),
    status: z.enum(['entwurf', 'freigegeben']),
    zusammenfassung: z.string().max(600),
    inhalt: z.string().max(60_000).nullable(),
    video_key: z.string().max(60).nullable(),
    prioritaet: z.number().int().min(1).max(5),
    abschnitte: z
      .object({
        zweck: z.string().max(1000).optional(),
        ausloeser: z.string().max(1000).optional(),
        automatisch: listen.optional(),
        schritte: listen.optional(),
        qualitaet: listen.optional(),
        fehler: listen.optional(),
        links: z.array(z.object({ label: z.string().max(80), href: z.string().max(200).regex(/^\//) })).max(10).optional(),
      })
      .strict(),
  })
  .partial()
  .strict();

/** PATCH – bearbeiten/freigeben (nur Admin) */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { slug } = await params;
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fehler('Ungültige Eingabe');
  const patch = parsed.data;
  if (patch.positionen) patch.positionen = patch.positionen.filter(istPosition);

  const { data } = await k.svc.from('akademie_artikel').select(ARTIKEL_SPALTEN).eq('slug', slug).maybeSingle();
  const alt = data as Artikel | null;
  if (!alt) return fehler('Nicht gefunden', 404);
  const neu = { ...alt, ...patch } as Artikel;
  const { error } = await k.svc
    .from('akademie_artikel')
    .update({ ...patch, such_text: suchTextVon(neu), bearbeitet_von: k.user.id, bearbeitet_am: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('slug', slug);
  if (error) return fehler(error.message, 500);
  return NextResponse.json({ ok: true });
}

/** DELETE – Entwurf verwerfen (nur Admin, nur Entwürfe) */
export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { slug } = await params;
  const { error } = await k.svc.from('akademie_artikel').delete().eq('slug', slug).eq('status', 'entwurf');
  if (error) return fehler(error.message, 500);
  return NextResponse.json({ ok: true });
}
