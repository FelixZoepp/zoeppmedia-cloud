import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { fixkostenSchema } from '@/lib/finanzen/vertrag-schema';

/** Feste Kosten anlegen (nur Admins) */
export async function POST(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const p = fixkostenSchema.safeParse(await req.json().catch(() => null));
  if (!p.success) return NextResponse.json({ error: 'Ungültige Eingabe' }, { status: 400 });
  const { data, error } = await createAdminClient().from('finanz_fixkosten').insert(p.data).select('*').single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ fixkosten: data });
}
