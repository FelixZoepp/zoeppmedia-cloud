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

  // Datum zu vollständigem ISO-Timestamp erweitern
  const fromTs = `${from}T00:00:00.000Z`;
  const toTs   = `${to}T23:59:59.999Z`;

  // --- Daten laden ---
  const svc = createAdminClient();

  const payload = await getRecruitingStats(svc, agencyId, {
    from:   fromTs,
    to:     toTs,
    jobId,
    source,
  });

  return NextResponse.json(payload);
}
