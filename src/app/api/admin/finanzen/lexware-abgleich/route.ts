import { NextResponse } from 'next/server';
import { isAdmin } from '@/lib/admin';
import { createAdminClient } from '@/lib/supabase/admin';
import { gleicheLexwareAb } from '@/lib/finanzen/lexware-abgleich';

export const maxDuration = 60;

/** Cash-Plan: Lexware jetzt abgleichen (nur lesend, nur Admins) – holt Rückstand in Stapeln */
export async function POST() {
  if (!(await isAdmin())) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const ergebnis = await gleicheLexwareAb(createAdminClient(), { maxDetails: 60, zeitbudgetMs: 45_000 });
  return NextResponse.json(ergebnis);
}
