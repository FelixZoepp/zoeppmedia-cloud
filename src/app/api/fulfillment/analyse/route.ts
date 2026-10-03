import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stepZeiten, proKunde, bremsendeSchritte } from '@/lib/fulfillment/analyse';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const svc = createAdminClient();

  const [{ data: steps }, { data: logs }, { data: agencies }] = await Promise.all([
    svc.from('client_steps').select('id, agency_id, step_key, phase, wer, status, gestartet_am, erledigt_am, faellig_am'),
    svc.from('client_step_log').select('step_id, nach_status, created_at'),
    svc.from('agencies').select('id, name, fulfillment_phase, launch_datum').not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`),
  ]);

  const zeiten = stepZeiten((steps ?? []) as never, (logs ?? []) as never);
  const names = new Map(((agencies ?? []) as Array<{ id: string; name: string; fulfillment_phase: string }>).map((a) => [a.id, a]));
  const kunden = proKunde(zeiten)
    .filter((k) => names.has(k.agency_id))
    .map((k) => ({ ...k, name: names.get(k.agency_id)!.name, phase: names.get(k.agency_id)!.fulfillment_phase }))
    .sort((a, b) => b.tage_ueber_frist - a.tage_ueber_frist);

  const summe = (f: (k: (typeof kunden)[number]) => number) => Math.round(kunden.reduce((a, k) => a + f(k), 0) * 10) / 10;
  return NextResponse.json({
    seit: ((steps ?? []) as Array<{ gestartet_am: string }>).map((s) => s.gestartet_am).sort()[0] ?? null,
    gesamt: { tage_kunde: summe((k) => k.tage_kunde), tage_zoepp: summe((k) => k.tage_zoepp) },
    verspaetung: {
      kunde: Math.round(zeiten.filter((z) => z.wer === 'kunde').reduce((a, z) => a + z.tage_ueber_frist, 0) * 10) / 10,
      zoepp: Math.round(zeiten.filter((z) => z.wer === 'zoepp').reduce((a, z) => a + z.tage_ueber_frist, 0) * 10) / 10,
    },
    kunden,
    schritte: bremsendeSchritte(zeiten.filter((z) => z.phase !== 'continuity')).slice(0, 10),
  });
}
