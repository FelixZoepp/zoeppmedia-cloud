import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { legeVorschlaegeAn, VorschlagSchema } from '@/lib/aufgaben/diktat';
import { z } from 'zod';

/** POST { vorschlaege } – bestätigte Vorschläge anlegen (Aufgaben/Serien + Benachrichtigung) */
export async function POST(req: NextRequest) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const parsed = z.object({ vorschlaege: z.array(VorschlagSchema.extend({ nr: z.number().int().min(0).max(100).optional() })).min(1).max(30), ref: z.string().regex(/^cloud:[0-9a-f-]{36}$/).nullable().optional() }).safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Vorschläge' }, { status: 400 });
  try {
    const angelegt = await legeVorschlaegeAn(createAdminClient(), parsed.data.vorschlaege, { id: user.id, name: user.name ?? '' }, 'sprachnachricht', new Date(), parsed.data.ref ?? null);
    return NextResponse.json({ angelegt });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
