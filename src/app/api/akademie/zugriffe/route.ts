import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { berechneZugriff } from '@/lib/akademie/zugriff';
import { istPosition, vorschlagFuer } from '@/lib/akademie/positionen';

/** GET – alle internen Mitarbeiter mit freigeschalteten Positionen (nur Admin) */
export async function GET() {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const [{ data: users }, { data: pos }, { data: art }] = await Promise.all([
    k.svc.from('users').select('id, name, email, role, funktion, aktiv').in('role', ['admin', 'employee']).order('name'),
    k.svc.from('akademie_freigaben').select('user_id, position, an'),
    k.svc.from('akademie_artikel_freigaben').select('user_id, slug, an'),
  ]);
  const posListe = (pos ?? []) as Array<{ user_id: string; position: string; an: boolean }>;
  const artListe = (art ?? []) as Array<{ user_id: string; slug: string; an: boolean }>;
  const mitarbeiter = ((users ?? []) as Array<{ id: string; name: string; email: string; role: string; funktion: string | null; aktiv: boolean | null }>).map((u) => {
    const eigenePos = posListe.filter((p) => p.user_id === u.id);
    const eigeneArt = artListe.filter((a) => a.user_id === u.id);
    const z = berechneZugriff({ id: u.id, role: u.role, funktion: u.funktion }, eigenePos, eigeneArt);
    return {
      ...u,
      admin: z.admin,
      vorschlag: vorschlagFuer(u.funktion),
      positionen: [...z.positionen],
      schalter: eigenePos.map((p) => ({ position: p.position, an: p.an })),
      artikel: eigeneArt.map((a) => ({ slug: a.slug, an: a.an })),
    };
  });
  return NextResponse.json({ mitarbeiter });
}

const schema = z.union([
  z.object({ user_id: z.string().uuid(), position: z.string(), an: z.boolean().nullable() }),
  z.object({ user_id: z.string().uuid(), slug: z.string().min(1).max(120), an: z.boolean().nullable() }),
]);

/** PUT – Position oder einzelnen Artikel für einen Mitarbeiter an/aus (an: null = zurück zum Vorschlag) */
export async function PUT(req: NextRequest) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fehler('Ungültige Eingabe');
  const b = parsed.data;
  if ('position' in b) {
    if (!istPosition(b.position)) return fehler('Unbekannte Position');
    const q = b.an === null
      ? k.svc.from('akademie_freigaben').delete().eq('user_id', b.user_id).eq('position', b.position)
      : k.svc.from('akademie_freigaben').upsert({ user_id: b.user_id, position: b.position, an: b.an, updated_at: new Date().toISOString() }, { onConflict: 'user_id,position' });
    const { error } = await q;
    if (error) return fehler(error.message, 500);
  } else {
    const q = b.an === null
      ? k.svc.from('akademie_artikel_freigaben').delete().eq('user_id', b.user_id).eq('slug', b.slug)
      : k.svc.from('akademie_artikel_freigaben').upsert({ user_id: b.user_id, slug: b.slug, an: b.an, updated_at: new Date().toISOString() }, { onConflict: 'user_id,slug' });
    const { error } = await q;
    if (error) return fehler(error.message, 500);
  }
  return NextResponse.json({ ok: true });
}
