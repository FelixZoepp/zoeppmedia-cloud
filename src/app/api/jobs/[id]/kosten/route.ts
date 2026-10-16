import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { isUuid } from '@/lib/supabase/filters';
import { ladeStellenKosten, zeitraum } from '@/lib/kosten/stellen';

/** Kosten & Kanäle einer Stelle (?tage=30). Interne sehen zusätzlich die zugeordneten Kampagnen-IDs. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 403 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: 'Ungültige ID' }, { status: 400 });

  const svc = createAdminClient();
  const { data: job } = await svc.from('jobs').select('id').eq('id', id).eq('agency_id', agencyId).maybeSingle();
  if (!job) return NextResponse.json({ error: 'Stellenanzeige nicht gefunden' }, { status: 404 });

  const tage = Math.min(Math.max(Number(req.nextUrl.searchParams.get('tage')) || 30, 7), 365);
  const kosten = await ladeStellenKosten(svc, agencyId, zeitraum(tage));
  const stelle = kosten.stellen.find((s) => s.job_id === id) ?? null;
  const intern = isInternal(user.role);

  let kampagnen: Array<{ campaign_id: string; campaign_name: string | null; quelle: string }> = [];
  if (intern) {
    const { data } = await svc.from('meta_kampagnen_zuordnung').select('campaign_id, campaign_name, quelle').eq('job_id', id);
    kampagnen = (data ?? []) as typeof kampagnen;
  }

  return NextResponse.json({
    tage,
    von: kosten.von,
    bis: kosten.bis,
    stelle,
    gesamt: kosten.gesamt,
    meta: kosten.meta,
    letzterAbgleich: kosten.letzterAbgleich,
    agencyId,
    intern,
    kampagnen,
  });
}
