import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  const agencyId = await getEffectiveAgencyId();
  // R7: return 403 instead of empty array
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const svc = createAdminClient();

  // Conversation muss zur Agency gehören (tenant scoping per R2)
  const { data: conv } = await svc
    .from('conversations')
    .select('id')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .single();

  if (!conv) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });

  // Messages laden
  const { data: messages } = await svc
    .from('messages')
    .select('id, direction, sender_type, user_id, type, body, media_path, wa_message_id, status, error_code, template_id, created_at')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true });

  // unread_count nullen (mit agency_id Scoping per R2)
  await svc.from('conversations')
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('agency_id', agencyId);

  return NextResponse.json(messages || []);
}
