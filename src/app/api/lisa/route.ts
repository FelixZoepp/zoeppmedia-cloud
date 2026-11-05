import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createNotificationForInternals } from '@/lib/notifications/create';
import { boardVon } from '@/lib/aufgaben/boards';
import { ladeLisaVerbindung } from '@/lib/lisa/verbindung';

/** Felix: Anfragen landen als Aufgabe auf seinem Board (wie die Finanz-Aufgaben) */
const FELIX_ID = '0f578dce-1412-4f5f-9168-ad664f319e6f';

/** GET: Stand von Hiring Lisa für den eigenen Kunden (ohne Geheimnisse, ohne Preise) */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId(user);
  if (!agencyId) return NextResponse.json({ error: 'Kein Kunde' }, { status: 400 });
  const row = await ladeLisaVerbindung(createAdminClient(), agencyId);
  return NextResponse.json({ status: row?.status ?? null, angefragt_am: row?.angefragt_am ?? null, aktiviert_am: row?.aktiviert_am ?? null });
}

/**
 * POST { notiz? }: Kunde fragt Hiring Lisa an. Es wird NICHTS gebucht und keine Rechnung erstellt –
 * nur eine Aufgabe für Felix („Paket mit dem Kunden besprechen“) und eine Glocke fürs Team.
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Nur Lesezugriff' }, { status: 403 });
  const agencyId = await getEffectiveAgencyId(user);
  if (!agencyId) return NextResponse.json({ error: 'Kein Kunde' }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { notiz?: string };
  const notiz = typeof body.notiz === 'string' ? body.notiz.trim().slice(0, 500) || null : null;

  const svc = createAdminClient();
  const vorher = await ladeLisaVerbindung(svc, agencyId);
  if (vorher && vorher.status !== 'angefragt') return NextResponse.json({ ok: true, status: vorher.status });
  if (vorher?.angefragt_am) return NextResponse.json({ ok: true, status: 'angefragt', schon: true });

  const jetzt = new Date().toISOString();
  const { error } = await svc.from('lisa_verbindungen').upsert(
    { agency_id: agencyId, status: 'angefragt', angefragt_am: jetzt, angefragt_von: user.id, anfrage_notiz: notiz, updated_at: jetzt },
    { onConflict: 'agency_id' },
  );
  if (error) return NextResponse.json({ error: 'Anfrage konnte nicht gespeichert werden' }, { status: 500 });

  const { data: ag } = await svc.from('agencies').select('name').eq('id', agencyId).maybeSingle();
  const firma = (ag as { name: string } | null)?.name ?? 'Kunde';
  const faellig = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
  await svc.from('internal_tasks').insert({
    title: `Hiring Lisa angefragt: ${firma}`,
    description:
      `${user.name ?? 'Der Kunde'} hat im Portal Hiring Lisa angefragt.${notiz ? `\n\nNotiz: ${notiz}` : ''}\n\n` +
      'Nächste Schritte: Paket mit dem Kunden besprechen → in Lisa anlegen → Schlüssel unter Kunde → Integrationen → Hiring Lisa eintragen → freischalten. ' +
      'Vertrag und Rechnung macht ihr selbst (die Cloud stellt keine Rechnung).',
    agency_id: agencyId,
    board_id: await boardVon(svc, FELIX_ID).catch(() => null),
    assigned_to: FELIX_ID,
    priority: 'high',
    status: 'todo',
    due_date: faellig,
    quelle: 'lisa',
    quelle_ref: `lisa-anfrage:${agencyId}`,
    created_by: user.id,
  });
  await createNotificationForInternals(svc, {
    agency_id: agencyId,
    title: `🤖 Hiring Lisa angefragt: ${firma}`,
    body: notiz ?? 'Paket mit dem Kunden besprechen',
    type: 'system',
    entity_type: 'agency',
    entity_id: agencyId,
  }).catch(() => {});

  return NextResponse.json({ ok: true, status: 'angefragt' });
}
