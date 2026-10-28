/**
 * GET /api/recruiting-stats/absagen?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Absagegründe der (effektiven) Agentur: Verteilung nach Grund, Gruppe, Phase und Woche.
 * Kunde und Innendienst (Kunden-Login). Nur lesend.
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { berechneAbsageStats, type AbsageZeile } from '@/lib/kpi/absage-stats';
import { fetchAll } from '@/lib/supabase/fetch-all';
import { berlinTagesGrenzen } from '@/lib/zeit/berlin';
import { pruefeZeitraum } from '@/lib/zeit/zeitraum';

const TAG = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId(user);
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!TAG.test(from) || !TAG.test(to)) return NextResponse.json({ error: 'Ungültiger Zeitraum' }, { status: 400 });
  const fehler = pruefeZeitraum(from, to);
  if (fehler) return NextResponse.json({ error: fehler }, { status: 400 });
  const { ab, bis } = berlinTagesGrenzen(from, to);

  const svc = createAdminClient();
  let zeilen: AbsageZeile[];
  try {
    zeilen = await fetchAll<AbsageZeile>((rFrom, rTo) =>
      svc
        .from('candidates')
        .select('id, name, absage_code, absage_notiz, absage_phase_id, abgesagt_am')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .gte('abgesagt_am', ab)
        .lte('abgesagt_am', bis)
        .order('id')
        .range(rFrom, rTo),
    );
  } catch {
    return NextResponse.json({ error: 'Absagen konnten nicht geladen werden' }, { status: 500 });
  }

  const phasenIds = [...new Set(zeilen.map((z) => z.absage_phase_id).filter((x): x is string => !!x))];
  const { data: phasen } = phasenIds.length ? await svc.from('pipeline_stages').select('id, name').in('id', phasenIds) : { data: [] };

  return NextResponse.json(
    berechneAbsageStats(zeilen, new Map(((phasen ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name]))),
  );
}
