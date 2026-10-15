import { NextResponse } from 'next/server';
import { getCurrentUser, isAgency } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { logActivity } from '@/lib/activity/log';
import { istFreigegeben } from '@/lib/freigaben';

/**
 * Kunde fragt die Masterclass für seine Führungskräfte an → interne Aufgabe für uns (kein Versand an den Kunden).
 * Höchstens eine offene Anfrage je Kunde und Woche.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || !isAgency(user.role) || !user.agency_id) return NextResponse.json({ error: 'Nur für Kunden' }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { anzahl?: unknown; notiz?: unknown };
  const anzahl = typeof body.anzahl === 'number' && body.anzahl > 0 && body.anzahl < 1000 ? Math.floor(body.anzahl) : null;
  const notiz = typeof body.notiz === 'string' ? body.notiz.trim().slice(0, 1000) : '';
  const svc = createAdminClient();
  if (!(await istFreigegeben(svc, 'masterclass_fuehrung_teaser'))) return NextResponse.json({ error: 'Noch nicht verfügbar' }, { status: 403 });

  const { count } = await svc
    .from('activity_log')
    .select('id', { count: 'exact', head: true })
    .eq('agency_id', user.agency_id)
    .eq('metadata->>kind', 'masterclass_fuehrung_anfrage')
    .gte('created_at', new Date(Date.now() - 7 * 864e5).toISOString());
  if (count) return NextResponse.json({ ok: true, schon: true });

  const { data: ag } = await svc.from('agencies').select('name').eq('id', user.agency_id).maybeSingle();
  const kunde = (ag as { name: string } | null)?.name ?? 'Kunde';
  await svc.from('internal_tasks').insert({
    title: `🎓 Masterclass Führungskräfte angefragt – ${kunde}`,
    description: `${user.name ?? user.email} möchte die Masterclass für Führungskräfte${anzahl ? ` für ${anzahl} Führungskräfte` : ''}.${notiz ? `\n\nNotiz: ${notiz}` : ''}\n\nIm nächsten Termin besprechen, dann in der Kundenakte unter „Masterclass für Führungskräfte“ freischalten.`,
    agency_id: user.agency_id,
    status: 'todo',
    priority: 'high',
    due_date: new Date().toISOString().slice(0, 10),
  });
  await logActivity(svc, {
    agency_id: user.agency_id,
    user_id: user.id,
    action: 'Masterclass für Führungskräfte angefragt',
    action_type: 'other',
    metadata: { kind: 'masterclass_fuehrung_anfrage', anzahl, notiz: notiz || null },
  });
  return NextResponse.json({ ok: true });
}
