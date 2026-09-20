import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { logAudit } from '@/lib/audit/log';
import { generateSlug } from '@/lib/recruiting/slug';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const CreateJobSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().max(10000).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  postal_code: z.string().max(10).nullable().optional(),
  employment_type: z.string().max(50).nullable().optional(),
  salary_range: z.string().max(100).nullable().optional(),
  contact_user_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'closed']).optional().default('draft'),
  indeed_mode: z.enum(['apply', 'redirect', 'off']).optional().default('off'),
});

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const supabase = await createServerClient();
  const { data: jobs, error } = await supabase
    .from('jobs')
    .select('*, applications(count)')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(jobs);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const body = await request.json();
  const parsed = CreateJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const supabase = await createServerClient();

  // Slug generieren mit Kollisions-Check
  let slug = generateSlug(parsed.data.title);
  const { data: existing } = await supabase
    .from('jobs')
    .select('slug')
    .eq('agency_id', agencyId)
    .like('slug', `${slug}%`);

  if (existing && existing.length > 0) {
    const existingSlugs = new Set(existing.map((j) => j.slug));
    if (existingSlugs.has(slug)) {
      let suffix = 2;
      while (existingSlugs.has(`${slug}-${suffix}`)) suffix++;
      slug = `${slug}-${suffix}`;
    }
  }

  const { data: job, error } = await supabase
    .from('jobs')
    .insert({
      agency_id: agencyId,
      title: parsed.data.title,
      slug,
      description: parsed.data.description ?? null,
      location: parsed.data.location ?? null,
      postal_code: parsed.data.postal_code ?? null,
      employment_type: parsed.data.employment_type ?? null,
      salary_range: parsed.data.salary_range ?? null,
      contact_user_id: parsed.data.contact_user_id ?? null,
      status: parsed.data.status,
      indeed_mode: parsed.data.indeed_mode,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    user_id: user.id,
    agency_id: agencyId,
    entity_type: 'job',
    entity_id: job.id,
    action: 'create',
  });

  return NextResponse.json(job, { status: 201 });
}
