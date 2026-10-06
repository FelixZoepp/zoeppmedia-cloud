import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { automatikAktiv, sendeWochenberichte } from '@/lib/wochenbericht/versand';

export const maxDuration = 300;

/** Montags: Wochenberichte an alle Kunden – nur wenn unter Admin → Wochenberichte eingeschaltet */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return NextResponse.json({ error: 'CRON_SECRET nicht konfiguriert' }, { status: 500 });
  if (request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const svc = createAdminClient();
  if (!(await automatikAktiv(svc))) return NextResponse.json({ ok: true, aus: true });
  const ergebnis = await sendeWochenberichte(svc);
  return NextResponse.json({ ok: true, ergebnis });
}
