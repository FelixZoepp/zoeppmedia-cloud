import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { pruefeEinrichtung } from '@/lib/einrichtung/check';

/** GET – Einrichtungs-Check (nur Admin): Variablen gesetzt/fehlt, Datenbank-Änderungen eingespielt */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  return NextResponse.json(await pruefeEinrichtung(createAdminClient()), { headers: { 'Cache-Control': 'no-store' } });
}
