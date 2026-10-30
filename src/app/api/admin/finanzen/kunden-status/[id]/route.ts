import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { KUENDIGUNGSGRUENDE } from '@/lib/finanzen/kundenhistorie';

const schema = z.object({
  upsell: z.boolean().nullable().optional(),
  rueckgewinnung: z.boolean().nullable().optional(),
  aktiv: z.boolean().optional(),
  segment: z.enum(['d2d', 'sonstige', 'raus']).optional(),
  kuendigungsgrund: z.enum(KUENDIGUNGSGRUENDE).nullable().optional(),
});

/** Kunde in der Historie bewerten (Upsell, Rückgewinnung, aktiv, Kündigungsgrund) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const { id } = await params;
  const p = schema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  const { error } = await createAdminClient().from('finanz_kunden_status').update({ ...p.data, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
