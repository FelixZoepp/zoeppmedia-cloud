import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { logAudit, diffChanges } from '@/lib/audit/log';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const UpdateJobSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(10000).nullable().optional(),
  location: z.string().max(200).nullable().optional(),
  postal_code: z.string().max(10).nullable().optional(),
  employment_type: z.string().max(50).nullable().optional(),
  salary_range: z.string().max(100).nullable().optional(),
  contact_user_id: z.string().uuid().nullable().optional(),
  status: z.enum(['draft', 'active', 'paused', 'closed']).optional(),
  indeed_mode: z.enum(['apply', 'redirect', 'off']).optional(),
});

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = await createServerClient();
  const { data: job, error } = await supabase
    .from('jobs')
    .select('*, applications(count)')
    .eq('id', id)
    .single();

  if (error || !job) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  return NextResponse.json(job);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const body = await request.json();
  const parsed = UpdateJobSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const supabase = await createServerClient();

  // Fetch current for audit diff
  const { data: current } = await supabase.from('jobs').select('*').eq('id', id).single();
  if (!current) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  const updateData: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };
  const { data: updated, error } = await supabase
    .from('jobs')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const changes = diffChanges(current, updated, Object.keys(parsed.data));
  if (changes.length > 0) {
    await logAudit(supabase, {
      user_id: user.id,
      agency_id: agencyId,
      entity_type: 'job',
      entity_id: id,
      action: 'update',
      changes,
    });
  }

  return NextResponse.json(updated);
}
