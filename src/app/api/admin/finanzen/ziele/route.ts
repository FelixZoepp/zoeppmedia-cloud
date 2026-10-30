import { NextRequest, NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { liesZiele, ZIELE_KEY } from '@/lib/finanzen/ziele';

/** Masterplan-Ziele im Cash-Plan (nur Admins) */
export async function GET() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const { data } = await createAdminClient().from('system_einstellungen').select('wert').eq('key', ZIELE_KEY).maybeSingle();
  return NextResponse.json({ ziele: liesZiele(data?.wert ?? null) });
}

export async function PUT(req: NextRequest) {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const ziele = liesZiele(await req.json().catch(() => null));
  const { error } = await createAdminClient().from('system_einstellungen').upsert({ key: ZIELE_KEY, wert: JSON.stringify(ziele) }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ziele });
}
