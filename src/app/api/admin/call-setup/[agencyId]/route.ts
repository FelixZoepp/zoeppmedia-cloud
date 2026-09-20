import { createAdminClient } from '@/lib/supabase/admin';
import { createServerClient } from '@/lib/supabase/server';
import { isInternalUser } from '@/lib/admin';
import { isUuid } from '@/lib/supabase/filters';
import { NextRequest, NextResponse } from 'next/server';

const SCRIPT_TYPES = ['erstkontakt', 'erinnerung_vg', 'erinnerung_probetag'];

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

  const [agencyResult, scriptsResult] = await Promise.all([
    admin.from('agencies').select('id, name, outbound_phone').eq('id', agencyId).single(),
    admin.from('call_scripts').select('script_type, content').eq('agency_id', agencyId),
  ]);

  if (!agencyResult.data) {
    return NextResponse.json({ error: 'Agentur nicht gefunden' }, { status: 404 });
  }

  const scripts: Record<string, string> = {};
  for (const s of scriptsResult.data ?? []) {
    scripts[s.script_type] = s.content;
  }

  return NextResponse.json({ agency: agencyResult.data, scripts });
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

  const body = await request.json();
  const admin = createAdminClient();

  // Büro-Nummer speichern
  if (body.outbound_phone !== undefined) {
    const { error } = await admin
      .from('agencies')
      .update({ outbound_phone: body.outbound_phone || null })
      .eq('id', agencyId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Skripte upserten (leerer Inhalt = löschen)
  if (body.scripts && typeof body.scripts === 'object') {
    for (const [type, content] of Object.entries(body.scripts)) {
      if (!SCRIPT_TYPES.includes(type)) continue;
      if (typeof content !== 'string') continue;
      if (content.trim() === '') {
        const { error } = await admin
          .from('call_scripts')
          .delete()
          .eq('agency_id', agencyId)
          .eq('script_type', type);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        const { error } = await admin
          .from('call_scripts')
          .upsert(
            { agency_id: agencyId, script_type: type, content },
            { onConflict: 'agency_id,script_type' }
          );
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true });
}
