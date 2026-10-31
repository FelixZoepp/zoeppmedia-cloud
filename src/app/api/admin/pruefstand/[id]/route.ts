import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { gibFrei, verwirf } from '@/lib/zuordnung/entscheidung';
import type { PruefstandEintrag } from '@/lib/zuordnung/pruefstand';

export const maxDuration = 60;

/** Einzelentscheidung: { aktion: 'freigeben', agency_id } oder { aktion: 'verwerfen' } */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { aktion?: string; agency_id?: string };
  const svc = createAdminClient();
  const { data } = await svc.from('bewerber_pruefstand').select('id, quelle, externe_ref, agency_vorschlag, name, daten, gruende, status, versuche, created_at').eq('id', id).maybeSingle();
  if (!data) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  const e = data as PruefstandEintrag;
  let r;
  if (b.aktion === 'freigeben') {
    if (!b.agency_id) return NextResponse.json({ error: 'Kunde wählen' }, { status: 400 });
    r = await gibFrei(svc, e, b.agency_id, user.id);
  } else if (b.aktion === 'verwerfen') {
    r = await verwirf(svc, e, user.id);
  } else return NextResponse.json({ error: 'Ungültige Aktion' }, { status: 400 });
  await svc.from('audit_log').insert({ actor_id: user.id, agency_id: b.agency_id ?? null, action: `pruefstand.${b.aktion}`, target: e.externe_ref, data: { ergebnis: r } }).then(() => {}, () => {});
  return r.ok ? NextResponse.json({ ok: true, candidate_id: r.candidateId }) : NextResponse.json({ error: r.grund }, { status: 422 });
}
