import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { fixkostenSchema } from '@/lib/finanzen/vertrag-schema';

/** Feste Kosten ändern / löschen (nur Admins) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const { id } = await params;
  const p = fixkostenSchema.partial().safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  const { error } = await createAdminClient().from('finanz_fixkosten').update(p.data).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const { id } = await params;
  const { error } = await createAdminClient().from('finanz_fixkosten').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
