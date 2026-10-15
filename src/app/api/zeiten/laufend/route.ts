import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { laufendeStoppuhr } from '@/lib/zeiten/server';

export const dynamic = 'force-dynamic';

/** GET – laufende Stoppuhr für die Anzeige im Kopf (still, wenn die Tabelle noch fehlt) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ schema: false, laufend: null });
  const svc = createAdminClient();
  try {
    const { schema, eintrag } = await laufendeStoppuhr(svc, user.id);
    if (!eintrag) return NextResponse.json({ schema, laufend: null });
    let kunde: string | null = null;
    if (eintrag.agency_id) {
      const { data } = await svc.from('agencies').select('name').eq('id', eintrag.agency_id).maybeSingle();
      kunde = (data as { name: string } | null)?.name ?? null;
    }
    return NextResponse.json({ schema, laufend: { id: eintrag.id, start: eintrag.start, taetigkeit: eintrag.taetigkeit, kunde } });
  } catch {
    return NextResponse.json({ schema: false, laufend: null });
  }
}

/** POST – laufende Stoppuhr stoppen */
export async function POST() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const svc = createAdminClient();
  const { schema, eintrag } = await laufendeStoppuhr(svc, user.id);
  if (!schema) return NextResponse.json({ error: 'Datenbank-Änderung fehlt noch' }, { status: 503 });
  if (!eintrag) return NextResponse.json({ ok: true, eintrag: null });
  const { data, error } = await svc
    .from('zeiteintraege')
    .update({ ende: new Date().toISOString() })
    .eq('id', eintrag.id)
    .is('ende', null)
    .select('id, minuten')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, eintrag: data });
}
