import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { reassignOpenStepsToFunktion } from '@/lib/fulfillment/engine';
import { STEP_BY_KEY, type Funktion } from '@/lib/fulfillment/catalog';
import { BEREICH_LABEL, bereichFehltInDb, istBereich } from '@/lib/team/funktionen';

/**
 * PATCH { user_id, funktion } – Bereich eines Mitarbeiters ändern (nur Admin).
 * Ist die Person die einzige im Bereich, übernimmt sie die offenen Fulfillment-Schritte dieses Bereichs.
 */
export async function PATCH(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { user_id?: string; funktion?: string | null };
  if (!body.user_id) return NextResponse.json({ error: 'user_id fehlt' }, { status: 400 });
  const funktion = body.funktion || null;
  if (funktion !== null && !istBereich(funktion)) return NextResponse.json({ error: 'Unbekannter Bereich' }, { status: 400 });

  const svc = createAdminClient();
  const { data: ziel } = await svc.from('users').select('id, role').eq('id', body.user_id).maybeSingle();
  if (!ziel || !['admin', 'employee'].includes((ziel as { role: string }).role)) {
    return NextResponse.json({ error: 'Mitarbeiter nicht gefunden' }, { status: 404 });
  }

  const { error } = await svc.from('users').update({ funktion }).eq('id', body.user_id);
  if (bereichFehltInDb(error)) {
    return NextResponse.json(
      { error: `Der Bereich „${BEREICH_LABEL[funktion ?? ''] ?? funktion}“ ist in der Datenbank noch nicht freigeschaltet (Migration „funktion_vertrieb“ fehlt).` },
      { status: 409 },
    );
  }
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });

  // Offene Schritte nur übernehmen, wenn sonst niemand diesen Bereich hat (sonst würden wir Kollegen Aufgaben wegnehmen)
  let uebernommen = 0;
  const hatSchritte = funktion !== null && [...STEP_BY_KEY.values()].some((d) => d.funktion === funktion);
  if (hatSchritte) {
    const { count } = await svc
      .from('users')
      .select('id', { count: 'exact', head: true })
      .in('role', ['admin', 'employee'])
      .eq('funktion', funktion)
      .neq('aktiv', false)
      .neq('id', body.user_id);
    if (!count) uebernommen = await reassignOpenStepsToFunktion(svc, body.user_id, funktion as Funktion);
  }

  return NextResponse.json({ ok: true, funktion, uebernommen });
}
