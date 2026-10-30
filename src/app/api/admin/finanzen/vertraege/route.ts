import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { ersterTag, vertragSchema } from '@/lib/finanzen/vertrag-schema';

/** Cash-Plan: Kundenverträge (nur Admins). GET → Liste, POST → neuer Vertrag */

export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const { data, error } = await createAdminClient().from('finanz_vertraege').select('*').order('kunde');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vertraege: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const parsed = vertragSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  const d = parsed.data;
  const { data, error } = await createAdminClient()
    .from('finanz_vertraege')
    .insert({ ...d, start: ersterTag(d.start), setup_monat: ersterTag(d.setup_monat) })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ vertrag: data });
}
