/**
 * GET /api/recruiting-stats/export
 *
 * Exportiert die Jobtabelle der Recruiting-Statistiken als CSV-Datei.
 * Trennzeichen Semikolon, UTF-8-BOM, CRLF — optimiert für deutsches Excel.
 *
 * Auth-Kette: getCurrentUser → 401; getEffectiveAgencyId → 403.
 * Query-Parameter: identisch mit GET /api/recruiting-stats.
 */

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRecruitingStats, type JobTableRow } from '@/lib/kpi/get-recruiting-stats';
import { toCsv, formatPercent } from '@/lib/kpi/csv';

// ---------------------------------------------------------------------------
// Query-Parameter-Schema — identisch mit GET /api/recruiting-stats
// ---------------------------------------------------------------------------

const querySchema = z.object({
  from:    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to:      z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  job_id:  z.string().uuid().optional(),
  source:  z.enum(['indeed', 'meta', 'form', 'manual']).optional(),
});

// ---------------------------------------------------------------------------
// CSV-Spaltenköpfe (exakt wie im Brief vorgegeben)
// ---------------------------------------------------------------------------

const CSV_HEADERS = [
  'Job',
  'Status',
  'Bewerbungen',
  'Antwortquote',
  'Qualifiziert',
  'Termine',
  'Einstellungen',
];

/**
 * Wandelt eine JobTableRow in eine CSV-Datenzeile um.
 * Antwortquote: number|null → deutsches Prozentformat oder leer.
 */
function jobRowToCsvRow(row: JobTableRow): Array<string | number | null> {
  return [
    row.title,
    row.status,
    row.bewerbungen,
    formatPercent(row.antwortquote),
    row.qualifiziert,
    row.termine,
    row.einstellungen,
  ];
}

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

  // --- CSV aufbauen ---
  const csvRows = payload.jobsTable.map(jobRowToCsvRow);
  const csv = toCsv(CSV_HEADERS, csvRows);

  // --- Response mit korrekten Headers ---
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type':        'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="jobs-statistik.csv"',
    },
  });
}
