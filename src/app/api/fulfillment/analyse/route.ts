import { NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { stepZeiten, proKunde, bremsendeSchritte } from '@/lib/fulfillment/analyse';
import { HIDDEN_AGENCY_IDS } from '@/lib/fulfillment/views';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const svc = createAdminClient();

  const [{ data: steps }, { data: logs }, { data: agencies }, { data: manuell }] = await Promise.all([
    svc.from('client_steps').select('id, agency_id, step_key, phase, wer, status, gestartet_am, erledigt_am, faellig_am'),
    svc.from('client_step_log').select('step_id, nach_status, created_at'),
    svc.from('agencies').select('id, name, fulfillment_phase, launch_datum').not('id', 'in', `(${HIDDEN_AGENCY_IDS.join(',')})`),
    svc.from('start_verzoegerungen').select('agency_id, tage, wer, grund'),
  ]);
  const erfasst = ((manuell ?? []) as Array<{ agency_id: string; tage: number; wer: 'kunde' | 'zoepp'; grund: string }>).map((m) => ({
    ...m,
    tage: Number(m.tage),
  }));

  const zeiten = stepZeiten((steps ?? []) as never, (logs ?? []) as never);
  const names = new Map(((agencies ?? []) as Array<{ id: string; name: string; fulfillment_phase: string }>).map((a) => [a.id, a]));
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const analysiert = new Map(proKunde(zeiten).map((k) => [k.agency_id, k]));
  const ids = new Set([...analysiert.keys(), ...erfasst.map((e) => e.agency_id)]);
  const kunden = [...ids]
    .filter((id) => names.has(id))
    .map((id) => {
      const k = analysiert.get(id) ?? { agency_id: id, tage_kunde: 0, tage_zoepp: 0, tage_ueber_frist: 0, bremse: null, langsamste: [] };
      const eigene = erfasst.filter((e) => e.agency_id === id);
      const mKunde = eigene.filter((e) => e.wer === 'kunde').reduce((a, e) => a + e.tage, 0);
      const mZoepp = eigene.filter((e) => e.wer === 'zoepp').reduce((a, e) => a + e.tage, 0);
      const spaetKunde = k.langsamste.filter((l) => l.wer === 'kunde').reduce((a, l) => a + l.tage_ueber_frist, 0) + mKunde;
      const spaetZoepp = k.langsamste.filter((l) => l.wer === 'zoepp').reduce((a, l) => a + l.tage_ueber_frist, 0) + mZoepp;
      return {
        ...k,
        tage_kunde: r1(k.tage_kunde + mKunde),
        tage_zoepp: r1(k.tage_zoepp + mZoepp),
        tage_ueber_frist: r1(k.tage_ueber_frist + mKunde + mZoepp),
        bremse: spaetKunde + spaetZoepp === 0 ? null : spaetKunde >= spaetZoepp ? ('kunde' as const) : ('zoepp' as const),
        erfasst: eigene.map((e) => ({ tage: e.tage, wer: e.wer, grund: e.grund })),
        name: names.get(id)!.name,
        phase: names.get(id)!.fulfillment_phase,
      };
    })
    .sort((a, b) => b.tage_ueber_frist - a.tage_ueber_frist);

  const summe = (f: (k: (typeof kunden)[number]) => number) => Math.round(kunden.reduce((a, k) => a + f(k), 0) * 10) / 10;
  return NextResponse.json({
    seit: ((steps ?? []) as Array<{ gestartet_am: string }>).map((s) => s.gestartet_am).sort()[0] ?? null,
    gesamt: { tage_kunde: summe((k) => k.tage_kunde), tage_zoepp: summe((k) => k.tage_zoepp) },
    verspaetung: {
      kunde: r1(zeiten.filter((z) => z.wer === 'kunde').reduce((a, z) => a + z.tage_ueber_frist, 0) + erfasst.filter((e) => e.wer === 'kunde').reduce((a, e) => a + e.tage, 0)),
      zoepp: r1(zeiten.filter((z) => z.wer === 'zoepp').reduce((a, z) => a + z.tage_ueber_frist, 0) + erfasst.filter((e) => e.wer === 'zoepp').reduce((a, e) => a + e.tage, 0)),
    },
    gruende: Object.entries(
      erfasst.reduce<Record<string, { tage: number; wer: string; anzahl: number }>>((acc, e) => {
        const key = `${e.wer}|${e.grund.toLowerCase()}`;
        acc[key] = { tage: (acc[key]?.tage ?? 0) + e.tage, wer: e.wer, anzahl: (acc[key]?.anzahl ?? 0) + 1 };
        return acc;
      }, {}),
    )
      .map(([k, v]) => ({ grund: erfasst.find((e) => `${e.wer}|${e.grund.toLowerCase()}` === k)!.grund, ...v }))
      .sort((a, b) => b.tage - a.tage),
    kunden,
    schritte: bremsendeSchritte(zeiten.filter((z) => z.phase !== 'continuity')).slice(0, 10),
  });
}
