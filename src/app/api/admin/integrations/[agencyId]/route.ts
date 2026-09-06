import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { isUuid } from '@/lib/supabase/filters';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ agencyId: string }> }
) {
  const { agencyId } = await params;
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  if (!isUuid(agencyId)) {
    return NextResponse.json({ error: 'Ungültige Agentur-ID' }, { status: 400 });
  }

  const admin = createAdminClient();

  const [agencyResult, funnelResult, emailLogResult, candidateStats] = await Promise.all([
    admin
      .from('agencies')
      .select('id, name, meta_ad_account_id')
      .eq('id', agencyId)
      .single(),
    admin
      .from('perspective_funnels')
      .select('id, perspective_funnel_id, name, status, url, updated_at')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from('inbound_email_log')
      .select('status, error_message, to_address, subject, created_at')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(10),
    admin
      .from('candidates')
      .select('source')
      .eq('agency_id', agencyId),
  ]);

  if (!agencyResult.data) {
    return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
  }

  // Bewerber pro Quelle zählen (zeigt, welche Anbindung wirklich liefert)
  const bySource: Record<string, number> = {};
  for (const c of candidateStats.data ?? []) {
    bySource[c.source ?? 'unbekannt'] = (bySource[c.source ?? 'unbekannt'] ?? 0) + 1;
  }

  return NextResponse.json({
    agency: agencyResult.data,
    funnel: funnelResult.data ?? null,
    email_log: emailLogResult.data ?? [],
    candidates_by_source: bySource,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ agencyId: string }> }
) {
  const { agencyId } = await params;
  const supabase = await createServerClient();
  if (!(await isInternalUser(supabase))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }
  if (!isUuid(agencyId)) {
    return NextResponse.json({ error: 'Ungültige Agentur-ID' }, { status: 400 });
  }

  const body = (await request.json()) as {
    perspective_funnel_id?: string;
    meta_ad_account_id?: string;
  };

  const admin = createAdminClient();

  if (body.meta_ad_account_id !== undefined) {
    const { error } = await admin
      .from('agencies')
      .update({ meta_ad_account_id: body.meta_ad_account_id.trim() || null })
      .eq('id', agencyId);
    if (error) {
      return NextResponse.json({ error: 'Meta-Konto konnte nicht gespeichert werden' }, { status: 500 });
    }
  }

  if (body.perspective_funnel_id !== undefined) {
    const funnelId = body.perspective_funnel_id.trim() || null;

    const { data: existing } = await admin
      .from('perspective_funnels')
      .select('id')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing) {
      const { error } = await admin
        .from('perspective_funnels')
        .update({ perspective_funnel_id: funnelId, updated_at: new Date().toISOString() })
        .eq('id', existing.id);
      if (error) {
        return NextResponse.json({ error: 'Funnel-ID konnte nicht gespeichert werden' }, { status: 500 });
      }
    } else {
      const { error } = await admin.from('perspective_funnels').insert({
        agency_id: agencyId,
        name: 'Recruiting Funnel',
        status: 'draft',
        perspective_funnel_id: funnelId,
      });
      if (error) {
        return NextResponse.json({ error: 'Funnel-ID konnte nicht gespeichert werden' }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}
