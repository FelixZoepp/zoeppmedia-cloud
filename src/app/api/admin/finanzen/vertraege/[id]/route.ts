import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { ersterTag, vertragFelder } from '@/lib/finanzen/vertrag-schema';

/** Cash-Plan: Vertrag ändern / löschen (nur Admins) */

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const { id } = await params;
  const parsed = vertragFelder.partial().safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  const d: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
  if (parsed.data.start) d.start = ersterTag(parsed.data.start);
  if ('setup_monat' in parsed.data) d.setup_monat = ersterTag(parsed.data.setup_monat);
  const { data, error } = await createAdminClient().from('finanz_vertraege').update(d).eq('id', id).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vertrag: data });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const { id } = await params;
  const { error } = await createAdminClient().from('finanz_vertraege').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
