import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { KATEGORIEN } from '@/lib/finanzen/ausgaben';

const schema = z.object({ kategorie: z.enum(KATEGORIEN).optional(), privat: z.boolean().optional(), alleGleichen: z.boolean().optional() });

/** Ausgabe umkategorisieren / als privat markieren – optional für alle Umsätze desselben Händlers */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const { id } = await params;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  const { alleGleichen, ...felder } = p.data;
  const svc = createAdminClient();
  if (alleGleichen) {
    const { data: a } = await svc.from('finanz_ausgaben').select('haendler').eq('id', id).maybeSingle();
    if (!a) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
    const praefix = (a.haendler as string).replace(/\*.*$/, '').trim();
    const { error } = await svc.from('finanz_ausgaben').update(felder).ilike('haendler', `${praefix.replace(/[%_]/g, '')}%`);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { error } = await svc.from('finanz_ausgaben').update(felder).eq('id', id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
