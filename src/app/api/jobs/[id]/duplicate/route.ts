import { createServerClient } from '@/lib/supabase/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { logAudit } from '@/lib/audit/log';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const supabase = await createServerClient();
  const { data: original } = await supabase.from('jobs').select('*').eq('id', id).eq('agency_id', agencyId).single();
  if (!original) return NextResponse.json({ error: 'Stellenanzeige nicht gefunden' }, { status: 404 });

  // Slug mit -kopie Suffix
  let slug = `${original.slug}-kopie`;
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

  const { data: copy, error } = await supabase
    .from('jobs')
    .insert({
      agency_id: agencyId,
      title: `${original.title} (Kopie)`,
      slug,
      description: original.description,
      location: original.location,
      postal_code: original.postal_code,
      employment_type: original.employment_type,
      salary_range: original.salary_range,
      contact_user_id: original.contact_user_id,
      status: 'draft',
      indeed_mode: original.indeed_mode,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await logAudit(supabase, {
    user_id: user.id,
    agency_id: agencyId,
    entity_type: 'job',
    entity_id: copy.id,
    action: 'create',
    changes: [{ field: 'duplicated_from', old: null, new: id }],
  });

  return NextResponse.json(copy, { status: 201 });
}
