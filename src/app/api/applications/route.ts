import { createServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { ingestApplication } from '@/lib/recruiting/ingest';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// GET /api/applications
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const jobId = request.nextUrl.searchParams.get('job_id');
  const candidateId = request.nextUrl.searchParams.get('candidate_id');
  const source = request.nextUrl.searchParams.get('source');
  const stageId = request.nextUrl.searchParams.get('stage_id');

  const supabase = await createServerClient();
  let query = supabase
    .from('applications')
    .select(
      `
      *,
      candidate:candidates(id, name, phone, phone_e164, email, source),
      job:jobs(id, title, slug),
      stage:pipeline_stages(id, name, color, stage_type)
    `
    )
    .eq('agency_id', agencyId)
    .order('applied_at', { ascending: false });

  if (jobId) query = query.eq('job_id', jobId);
  if (candidateId) query = query.eq('candidate_id', candidateId);
  if (source) query = query.eq('source', source);
  if (stageId) query = query.eq('stage_id', stageId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

// POST /api/applications (manual create)
const createSchema = z.object({
  jobId: z.string().uuid(),
  firstName: z.string().min(1),
  lastName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Ungültige Eingabe', details: parsed.error.flatten() }, { status: 400 });
  }

  // Job muss zur Agentur gehören
  const supabase = await createServerClient();
  const { data: job } = await supabase
    .from('jobs')
    .select('id')
    .eq('id', parsed.data.jobId)
    .eq('agency_id', agencyId)
    .single();
  if (!job) return NextResponse.json({ error: 'Stellenanzeige nicht gefunden' }, { status: 404 });

  // ingestApplication braucht Service-Role (schreibt candidates + applications + activity_log)
  const admin = createAdminClient();
  const result = await ingestApplication(admin, {
    agencyId,
    jobId: parsed.data.jobId,
    firstName: parsed.data.firstName,
    lastName: parsed.data.lastName ?? null,
    phone: parsed.data.phone ?? null,
    email: parsed.data.email ?? null,
    source: 'manual',
  });

  return NextResponse.json(result, { status: result.applicationCreated ? 201 : 200 });
}
