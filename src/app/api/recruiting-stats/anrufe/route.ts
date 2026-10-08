/**
 * GET /api/recruiting-stats/anrufe?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Anruf-Kennzahlen der (effektiven) Agentur: Ergebnisse, Erreichbarkeit, je Person,
 * Speed-to-Lead und No-Show-Quote. Kunde und Innendienst (Kunden-Login).
 */

import { NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { berechneAnrufStats } from '@/lib/kpi/anruf-stats';
import { fetchAll } from '@/lib/supabase/fetch-all';

const TAG = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const from = searchParams.get('from') ?? '';
  const to = searchParams.get('to') ?? '';
  if (!TAG.test(from) || !TAG.test(to)) return NextResponse.json({ error: 'Ungültiger Zeitraum' }, { status: 400 });
  const ab = `${from}T00:00:00.000Z`;
  const bis = `${to}T23:59:59.999Z`;

  const svc = createAdminClient();
  // Seitenweise laden – Supabase liefert pro Abfrage höchstens 1000 Zeilen
  let anrufe: Array<{ user_id: string | null; result: string | null }>;
  let cands: Array<{ ttfc_seconds: number | null }>;
  let termine: Array<{ status: string | null; scheduled_at: string }>;
  try {
    [anrufe, cands, termine] = await Promise.all([
      fetchAll<{ user_id: string | null; result: string | null }>((rFrom, rTo) =>
        svc.from('call_logs').select('user_id, result').eq('agency_id', agencyId).gte('created_at', ab).lte('created_at', bis).order('id').range(rFrom, rTo),
      ),
      fetchAll<{ ttfc_seconds: number | null }>((rFrom, rTo) =>
        svc
          .from('candidates')
          .select('ttfc_seconds')
          .eq('agency_id', agencyId)
          .is('deleted_at', null)
          .gte('created_at', ab)
          .lte('created_at', bis)
          .order('id')
          .range(rFrom, rTo),
      ),
      fetchAll<{ status: string | null; scheduled_at: string }>((rFrom, rTo) =>
        svc.from('candidate_appointments').select('status, scheduled_at').eq('agency_id', agencyId).gte('scheduled_at', ab).lte('scheduled_at', bis).order('id').range(rFrom, rTo),
      ),
    ]);
  } catch {
    return NextResponse.json({ error: 'Anrufe konnten nicht geladen werden' }, { status: 500 });
  }

  const userIds = [...new Set(anrufe.map((a) => a.user_id).filter((x): x is string => !!x))];
  const { data: users } = userIds.length ? await svc.from('users').select('id, name').in('id', userIds) : { data: [] };

  return NextResponse.json(
    berechneAnrufStats(
      anrufe,
      new Map(((users ?? []) as Array<{ id: string; name: string }>).map((u) => [u.id, u.name])),
      cands.map((c) => c.ttfc_seconds),
      termine,
      new Date(),
    ),
  );
}
