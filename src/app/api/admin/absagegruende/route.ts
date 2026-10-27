/**
 * GET /api/admin/absagegruende?tage=90
 * Absagegründe über alle Kunden: Gesamtverteilung + je Kunde der häufigste Grund. Nur Admin, nur lesend.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { berechneAbsageStats, type AbsageZeile } from '@/lib/kpi/absage-stats';
import { fetchAll } from '@/lib/supabase/fetch-all';

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (user.role !== 'admin') return NextResponse.json({ error: 'Kein Zugriff — nur für Admins' }, { status: 403 });

  const tage = Math.min(365, Math.max(7, Number(new URL(request.url).searchParams.get('tage')) || 90));
  const ab = new Date(Date.now() - tage * 86_400_000).toISOString();

  const svc = createAdminClient();
  let zeilen: Array<AbsageZeile & { agency_id: string }>;
  try {
    zeilen = await fetchAll<AbsageZeile & { agency_id: string }>((rFrom, rTo) =>
      svc
        .from('candidates')
        .select('id, agency_id, name, absage_code, absage_notiz, absage_phase_id, abgesagt_am')
        .is('deleted_at', null)
        .gte('abgesagt_am', ab)
        .order('id')
        .range(rFrom, rTo),
    );
  } catch {
    return NextResponse.json({ error: 'Absagen konnten nicht geladen werden' }, { status: 500 });
  }

  const agencyIds = [...new Set(zeilen.map((z) => z.agency_id))];
  const phasenIds = [...new Set(zeilen.map((z) => z.absage_phase_id).filter((x): x is string => !!x))];
  const [{ data: agencies }, { data: phasen }] = await Promise.all([
    agencyIds.length ? svc.from('agencies').select('id, name').in('id', agencyIds) : Promise.resolve({ data: [] }),
    phasenIds.length ? svc.from('pipeline_stages').select('id, name').in('id', phasenIds) : Promise.resolve({ data: [] }),
  ]);
  const phasenMap = new Map(((phasen ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]));
  const namen = new Map(((agencies ?? []) as Array<{ id: string; name: string }>).map((a) => [a.id, a.name]));

  const gesamt = berechneAbsageStats(zeilen, phasenMap);
  const proKunde = agencyIds
    .map((id) => {
      const s = berechneAbsageStats(zeilen.filter((z) => z.agency_id === id), phasenMap);
      return { agencyId: id, name: namen.get(id) ?? 'Unbekannt', gesamt: s.gesamt, ohneGrund: s.ohneGrund, top: s.proGrund.slice(0, 3) };
    })
    .sort((a, b) => b.gesamt - a.gesamt);

  // Notizen/Namen der Bewerber bleiben in der Kundenansicht – hier nur Zahlen
  return NextResponse.json({ tage, gesamt: { ...gesamt, letzte: [] }, proKunde });
}
