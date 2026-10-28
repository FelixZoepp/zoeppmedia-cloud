import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { pruefeHerzschlag } from '@/lib/ops/system-waechter';

export const dynamic = 'force-dynamic';

/**
 * Von außen (GitHub Actions, alle 15 Min.) aufgerufen: läuft der Hintergrund-Takt noch?
 * Steht er, meldet der Wächter das gedrosselt in Slack. Ist die Cloud ganz weg, schlägt schon dieser Aufruf fehl.
 * Ohne Login: gibt nur ok/Alter zurück, keine Daten.
 */
export async function GET() {
  const { ok, alterMin } = await pruefeHerzschlag(createAdminClient());
  return NextResponse.json({ ok, tick_alter_min: alterMin }, { status: ok ? 200 : 503 });
}
