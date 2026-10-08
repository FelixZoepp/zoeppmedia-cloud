import { displayTemplateBody, friendlyWhatsAppError } from '@/lib/whatsapp/template-text';
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

  // Vorlagen-Nachrichten lesbar machen (ältere haben nur den Vorlagennamen gespeichert)
  const rows = (messages ?? []) as Array<Record<string, unknown> & { type: string; body: string | null; error_code: string | null }>;
  let templateBodies = new Map<string, string>();
  if (rows.some((m) => m.type === 'template')) {
    const { data: tmpls } = await svc.from('whatsapp_templates').select('name, body').eq('agency_id', agencyId);
    templateBodies = new Map(((tmpls ?? []) as Array<{ name: string; body: string }>).map((t) => [t.name, t.body]));
  }
  // Medien (eingehend + ausgehend liegen im selben Bucket) als kurzlebige Links für die Anzeige
  const medienUrls = new Map<string, string>();
  const pfade = rows.map((m) => m.media_path as string | null).filter((p): p is string => !!p);
  if (pfade.length) {
    const { data: signiert } = await svc.storage.from('whatsapp-media').createSignedUrls(pfade, 3600);
    for (const s of signiert ?? []) if (s.path && s.signedUrl) medienUrls.set(s.path, s.signedUrl);
  }

  const view = rows.map((m) => ({
    ...m,
    media_url: m.media_path ? medienUrls.get(m.media_path as string) ?? null : null,
    body: m.type === 'template' ? displayTemplateBody(m.body, templateBodies) : m.body,
    vorlage: m.type === 'template',
    fehler_text: friendlyWhatsAppError(m.error_code),
  }));

  // unread_count nullen (mit agency_id Scoping per R2)
  await svc.from('conversations')
    .update({ unread_count: 0, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('agency_id', agencyId);

  return NextResponse.json(view);
}
