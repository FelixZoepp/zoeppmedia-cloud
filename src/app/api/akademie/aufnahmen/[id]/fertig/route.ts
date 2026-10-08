import { NextResponse, after } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fehler } from '@/lib/akademie/api';
import { darfAufnehmen, verarbeiteAufnahme } from '@/lib/akademie/aufnahme';

export const maxDuration = 300;

/** POST – Upload abgeschlossen → Verarbeitung im Hintergrund starten (Tick holt Hängengebliebenes nach) */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return fehler('Nicht angemeldet', 401);
  const svc = createAdminClient();
  if (!(await darfAufnehmen(svc, user))) return fehler('Keine Berechtigung', 403);
  const { id } = await params;

  const { data } = await svc.from('akademie_aufnahmen').select('id, erstellt_von, status').eq('id', id).maybeSingle();
  const a = data as { id: string; erstellt_von: string | null; status: string } | null;
  if (!a) return fehler('Nicht gefunden', 404);
  if (a.erstellt_von !== user.id && user.role !== 'admin') return fehler('Keine Berechtigung', 403);
  if (a.status !== 'hochladen') return NextResponse.json({ ok: true, status: a.status });

  await svc.from('akademie_aufnahmen').update({ status: 'wartet', updated_at: new Date().toISOString() }).eq('id', id).eq('status', 'hochladen');
  after(() => verarbeiteAufnahme(svc, id).then(() => undefined).catch((err) => console.error('[akademie] Aufnahme', id, err)));
  return NextResponse.json({ ok: true, status: 'wartet' });
}
