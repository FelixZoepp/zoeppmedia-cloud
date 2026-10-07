import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { erstelleMarketingFeedback } from '@/lib/gespraeche/marketing';

export const maxDuration = 120;

async function erlaubt(req: NextRequest, svc: ReturnType<typeof createAdminClient>): Promise<boolean> {
  const token = req.headers.get('x-sync-token');
  if (token) {
    const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'sync_token').maybeSingle();
    if ((data as { wert: string } | null)?.wert === token) return true;
  }
  const user = await getCurrentUser();
  return !!user && isInternal(user.role);
}

/** GET – letztes Marketing-Feedback */
export async function GET(req: NextRequest) {
  const svc = createAdminClient();
  if (!(await erlaubt(req, svc))) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { data } = await svc.from('marketing_feedback').select('*').order('created_at', { ascending: false }).limit(1).maybeSingle();
  return NextResponse.json({ feedback: data ?? null });
}

/** POST { tage? } – jetzt neu erstellen */
export async function POST(req: NextRequest) {
  const svc = createAdminClient();
  if (!(await erlaubt(req, svc))) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { tage?: number };
  try {
    const r = await erstelleMarketingFeedback(svc, Math.min(60, Math.max(1, Number(b.tage) || 7)));
    if (!r) return NextResponse.json({ error: 'Keine Einwände oder Fragen im Zeitraum' }, { status: 404 });
    return NextResponse.json({ ok: true, id: r.id, gespraeche: r.gespraeche });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 502 });
  }
}
