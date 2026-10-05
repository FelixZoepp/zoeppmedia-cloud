import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/** Kontakt der Konversation umbenennen (z. B. automatisch aus WhatsApp angelegte Nummern). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (user.role === 'agency_viewer') return NextResponse.json({ error: 'Keine Berechtigung' }, { status: 403 });
  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: 'Bitte einen Namen mit 2–120 Zeichen angeben' }, { status: 400 });

  const svc = createAdminClient();
  const { data: conv } = await svc.from('conversations').select('candidate_id').eq('id', id).eq('agency_id', agencyId).maybeSingle();
  if (!conv) return NextResponse.json({ error: 'Konversation nicht gefunden' }, { status: 404 });

  const { error } = await svc
    .from('candidates')
    .update({ name })
    .eq('id', (conv as { candidate_id: string }).candidate_id)
    .eq('agency_id', agencyId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, name });
}
