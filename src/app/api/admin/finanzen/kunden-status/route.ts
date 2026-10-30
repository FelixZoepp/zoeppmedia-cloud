import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';

/** Kundenhistorie (nur Admins) */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const { data, error } = await createAdminClient()
    .from('finanz_kunden_status')
    .select('id, kunde, segment, upsell, rueckgewinnung, aktiv, kuendigungsgrund, notiz')
    .order('aktiv', { ascending: false })
    .order('kunde');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ kunden: data ?? [] });
}
