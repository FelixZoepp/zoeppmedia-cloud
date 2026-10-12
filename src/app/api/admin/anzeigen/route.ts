import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeAnzeigen } from '@/lib/marketing/anzeigen';

export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const tage = Math.min(90, Math.max(1, Number(req.nextUrl.searchParams.get('tage') ?? 30) || 30));
  try {
    return NextResponse.json(await ladeAnzeigen(createAdminClient(), tage));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Fehler' }, { status: 500 });
  }
}
