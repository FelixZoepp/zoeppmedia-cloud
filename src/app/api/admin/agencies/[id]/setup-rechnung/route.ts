import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { verknuepfeSetupRechnung } from '@/lib/vertrag/zahlung';
import { logActivity } from '@/lib/activity/log';

type Ctx = { params: Promise<{ id: string }> };

/** GET – Stand Vertrag/Setup-Rechnung (nur Kunden aus dem neuen Ablauf haben einen Vertrag) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !['admin', 'employee'].includes(user.role)) return NextResponse.json({ error: 'Nur intern' }, { status: 403 });
  const { id } = await params;
  const { data } = await createAdminClient()
    .from('vertraege')
    .select('status, unterzeichner_name, bestaetigt_am, setup_rechnung_nummer, setup_rechnung_status, setup_bezahlt_am')
    .eq('agency_id', id)
    .maybeSingle();
  return NextResponse.json({ vertrag: data ?? null });
}

/** POST { nummer } – Lexware-Rechnungsnummer von Hand verknüpfen, wenn die Automatik nichts findet */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !['admin', 'employee'].includes(user.role)) return NextResponse.json({ error: 'Nur intern' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { nummer?: unknown };
  const svc = createAdminClient();
  try {
    const erg = await verknuepfeSetupRechnung(svc, id, typeof body.nummer === 'string' ? body.nummer : '');
    if (!erg.ok) return NextResponse.json({ error: erg.fehler }, { status: 400 });
    await logActivity(svc, {
      agency_id: id,
      user_id: user.id,
      action: `Setup-Rechnung ${String(body.nummer)} verknüpft (${erg.status})`,
      action_type: 'setup_rechnung_verknuepft',
      metadata: erg,
    }).catch(() => {});
    return NextResponse.json(erg);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Lexware nicht erreichbar' }, { status: 502 });
  }
}
