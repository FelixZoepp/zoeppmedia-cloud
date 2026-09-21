import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { ingestApplication } from '@/lib/recruiting/ingest';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const ImportSchema = z.object({
  jobId: z.string().uuid(),
  rows: z.array(z.object({
    firstName: z.string().optional().default(''),
    lastName: z.string().optional().default(''),
    phone: z.string().optional().default(''),
    email: z.string().optional().default(''),
  })).min(1).max(1000),
  optInConfirmed: z.boolean(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const body = await request.json();
  const parsed = ImportSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { jobId, rows, optInConfirmed } = parsed.data;
  const svc = createAdminClient();

  let created = 0;
  let duplicates = 0;
  let invalid = 0;

  for (const row of rows) {
    if (!row.firstName && !row.phone) { invalid++; continue; }

    try {
      const result = await ingestApplication(svc, {
        agencyId,
        jobId,
        firstName: row.firstName || 'Unbekannt',
        lastName: row.lastName || null,
        phone: row.phone || null,
        email: row.email || null,
        source: 'csv',
        consentWhatsapp: optInConfirmed,
        consentSource: optInConfirmed ? 'csv_import' : undefined,
      });

      if (result.applicationCreated) created++;
      else if (result.duplicateWithin30Days) duplicates++;
      else duplicates++;
    } catch {
      invalid++;
    }
  }

  return NextResponse.json({ created, duplicates, invalid });
}
