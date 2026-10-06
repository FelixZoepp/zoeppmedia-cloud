import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { aktualisiereSalesVorlagen, reicheSalesVorlageEin, SALES_VORLAGEN } from '@/lib/sales/vorlagen';

/** Admin (oder interner Token aus system_einstellungen.sync_token) */
async function erlaubt(req: NextRequest, svc: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const token = req.headers.get('x-sync-token');
  if (token) {
    const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'sync_token').maybeSingle();
    if ((data as { wert: string } | null)?.wert === token) return true;
  }
  const user = await getCurrentUser().catch(() => null);
  return user?.role === 'admin';
}

/** GET: Status der Sales-Vorlagen bei Meta · POST { name }: Vorlage bei Meta einreichen */
export async function GET(req: NextRequest) {
  const svc = createAdminClient();
  if (!(await erlaubt(req, svc))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    return NextResponse.json({ vorlagen: await aktualisiereSalesVorlagen(svc), bekannt: SALES_VORLAGEN.map((v) => v.name) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const svc = createAdminClient();
  if (!(await erlaubt(req, svc))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { name } = (await req.json().catch(() => ({}))) as { name?: string };
  if (!name) return NextResponse.json({ error: 'name fehlt' }, { status: 400 });
  try {
    return NextResponse.json(await reicheSalesVorlageEin(svc, name));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 500 });
  }
}
