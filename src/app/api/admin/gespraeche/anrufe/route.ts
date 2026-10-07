import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeAnruf, ladeAnrufe, schickeAnruf } from '@/lib/gespraeche/close-anrufe';

export const maxDuration = 120;

/** POST { tage? } oder { call_id } – Close-Telefonate mit Aufnahme an Fireflies zur Analyse geben (intern / Sync-Token) */
export async function POST(req: NextRequest) {
  const svc = createAdminClient();
  const token = req.headers.get('x-sync-token');
  let ok = false;
  if (token) {
    const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'sync_token').maybeSingle();
    ok = (data as { wert: string } | null)?.wert === token;
  }
  if (!ok) {
    const user = await getCurrentUser();
    ok = !!user && isInternal(user.role);
  }
  if (!ok) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });

  const b = (await req.json().catch(() => ({}))) as { tage?: number; call_id?: string };
  try {
    const anrufe = b.call_id
      ? [await ladeAnruf(b.call_id)].filter((x): x is NonNullable<typeof x> => !!x && !!x.recording_url)
      : await ladeAnrufe(new Date(Date.now() - Math.min(30, Math.max(1, Number(b.tage) || 2)) * 864e5));
    const ergebnis: Array<{ call_id: string; ergebnis: string }> = [];
    // Einzelner Anruf auf Wunsch immer; Zeitraum nur Setting-/Verkaufstelefonate
    for (const c of anrufe.slice(0, 20)) ergebnis.push({ call_id: c.id, ergebnis: await schickeAnruf(svc, c, { auchOhneTermin: !!b.call_id }) });
    return NextResponse.json({ gefunden: anrufe.length, ergebnis });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 502 });
  }
}
