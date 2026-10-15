/**
 * GET /api/recruiting-stats
 *
 * Liefert Recruiting-Kennzahlen, Jobtabelle und offene Aufgaben
 * für das Kunden-Dashboard.
 *
 * Auth-Kette: getCurrentUser → 401; getEffectiveAgencyId → 403.
 * Kein canWriteRole (nur lesender Zugriff).
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRecruitingStats } from '@/lib/kpi/get-recruiting-stats';
import { berlinTagesGrenzen, vorperiode } from '@/lib/zeit/berlin';
import { pruefeZeitraum } from '@/lib/zeit/zeitraum';

// ---------------------------------------------------------------------------
// Query-Parameter-Schema
// ---------------------------------------------------------------------------

const querySchema = z.object({
  from:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  job_id:  z.string().uuid().optional(),
  source:  z.enum(['indeed', 'meta', 'form', 'manual']).optional(),
});

// ---------------------------------------------------------------------------
// GET-Handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  // --- Auth ---
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  }

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) {
    return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });
  }

  // --- Query-Parameter parsen ---
  const { searchParams } = new URL(request.url);
  const rawParams = Object.fromEntries(searchParams.entries());

  const parsed = querySchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const { from, to, job_id: jobId, source } = parsed.data;

  const fehler = pruefeZeitraum(from, to);
  if (fehler) {
    return NextResponse.json({ error: fehler }, { status: 400 });
  }

  // Berliner Kalendertage → UTC-Grenzen (00:00 bis 23:59:59.999 Uhr deutscher Zeit)
  const aktuell = berlinTagesGrenzen(from, to);
  const vor     = vorperiode(from, to);
  const vorher  = berlinTagesGrenzen(vor.from, vor.to);

  // --- Daten laden ---
  const svc = createAdminClient();

  const payload = await getRecruitingStats(svc, agencyId, {
    from:     aktuell.ab,
    to:       aktuell.bis,
    prevFrom: vorher.ab,
    prevTo:   vorher.bis,
    jobId,
    source,
  });

  return NextResponse.json(payload);
}
