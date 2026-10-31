import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Manatal-Stelle (ID) einmal für genau einen Kunden bestätigen – danach laufen ihre Bewerber automatisch durch.
 * Body: { manatal_job_id, manatal_organisation, stellentitel?, agency_id }
 * Wartende Prüfstand-Fälle dieser Stelle werden sofort neu geprüft (nicht direkt angelegt – sie durchlaufen alle Prüfungen).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  const b = (await req.json().catch(() => ({}))) as { manatal_job_id?: number; manatal_organisation?: number; stellentitel?: string; agency_id?: string };
  if (!Number.isFinite(b.manatal_job_id) || !b.agency_id) return NextResponse.json({ error: 'manatal_job_id und agency_id nötig' }, { status: 400 });
  const svc = createAdminClient();
  const { data: vorhanden } = await svc.from('manatal_stellen').select('agency_id').eq('manatal_job_id', b.manatal_job_id).maybeSingle();
  if (vorhanden && (vorhanden as { agency_id: string }).agency_id !== b.agency_id) {
    return NextResponse.json({ error: 'Diese Manatal-Stelle ist bereits einem anderen Kunden bestätigt' }, { status: 409 });
  }
  const { error } = await svc.from('manatal_stellen').upsert({
    manatal_job_id: b.manatal_job_id,
    manatal_organisation: b.manatal_organisation ?? null,
    stellentitel: b.stellentitel ?? null,
    agency_id: b.agency_id,
    bestaetigt_von: user.id,
    bestaetigt_am: new Date().toISOString(),
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await svc.from('bewerber_pruefstand').update({ naechster_versuch: new Date().toISOString() }).eq('quelle', 'manatal').in('status', ['wartet', 'offen']).eq('daten->>job', String(b.manatal_job_id));
  await svc.from('audit_log').insert({ actor_id: user.id, agency_id: b.agency_id, action: 'manatal.stelle_bestaetigt', target: String(b.manatal_job_id), data: b }).then(() => {}, () => {});
  return NextResponse.json({ ok: true });
}
