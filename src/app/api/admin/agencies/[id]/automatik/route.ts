import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity/log';

type Ctx = { params: Promise<{ id: string }> };

/** GET – Stand des Schalters „Automatik (neue Fulfillment-Strecke)“ (intern) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !['admin', 'employee'].includes(user.role)) return NextResponse.json({ error: 'Nur intern' }, { status: 403 });
  const { id } = await params;
  const { data, error } = await createAdminClient().from('agencies').select('automatik').eq('id', id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ automatik: (data as { automatik?: boolean } | null)?.automatik === true, darfSchalten: user.role === 'admin' });
}

/** PATCH { automatik: boolean } – nur Admins */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { automatik?: unknown };
  if (typeof body.automatik !== 'boolean') return NextResponse.json({ error: 'automatik muss true oder false sein' }, { status: 400 });

  const svc = createAdminClient();
  const { error } = await svc.from('agencies').update({ automatik: body.automatik }).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await logActivity(svc, {
    agency_id: id,
    user_id: user.id,
    action: `Automatik (neue Fulfillment-Strecke) ${body.automatik ? 'eingeschaltet' : 'ausgeschaltet'}`,
    action_type: 'automatik_geschaltet',
    metadata: { automatik: body.automatik },
  }).catch(() => {});
  return NextResponse.json({ automatik: body.automatik });
}
