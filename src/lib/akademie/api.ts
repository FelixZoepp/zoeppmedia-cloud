import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getCurrentUser, type CurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { istIntern, ladeZugriff, type Zugriff } from './zugriff';

export type AkademieKontext = { user: CurrentUser; svc: SupabaseClient; zugriff: Zugriff };

/** Login + interne Rolle (+ optional Admin) prüfen und Freischaltung laden */
export async function akademieKontext(opts: { admin?: boolean } = {}): Promise<AkademieKontext | NextResponse> {
  const user = await getCurrentUser();
  if (!user || !istIntern(user.role)) return NextResponse.json({ error: 'Nur für das Team' }, { status: 403 });
  if (opts.admin && user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const svc = createAdminClient();
  const zugriff = await ladeZugriff(svc, { id: user.id, role: user.role, funktion: user.funktion ?? null });
  return { user, svc, zugriff };
}

export const fehler = (msg: string, status = 400) => NextResponse.json({ error: msg }, { status });
