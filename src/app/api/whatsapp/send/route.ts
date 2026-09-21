import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { cancelBotTimers } from '@/lib/bot/timers';
import { z } from 'zod';

// I2: restrict type to implemented variants only (image/document not in v1)
// M2: refine — for type === 'text', body must be a non-empty string after trim
const SendSchema = z
  .object({
    conversationId: z.string().uuid(),
    type: z.enum(['text', 'template']),
    body: z.string().optional(),
    templateId: z.string().uuid().optional(),
    templateVariables: z.record(z.string(), z.string()).optional(),
  })
  .refine(
    (d) => d.type !== 'text' || (typeof d.body === 'string' && d.body.trim().length > 0),
    { message: 'body muss für type=text ein nicht-leerer String sein' }
  );

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  // I1: wrap request.json() in try/catch
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 });
  }

  const parsed = SendSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: 'Validierungsfehler' }, { status: 400 });

  const svc = createAdminClient();

  // Conversation laden (mit Tenant-Prüfung)
  const { data: conv } = await svc
    .from('conversations')
    .select('id, candidate_id, wa_account_id, state')
    .eq('id', parsed.data.conversationId)
    .eq('agency_id', agencyId)
    .single();

  if (!conv) return NextResponse.json({ error: 'Konversation nicht gefunden' }, { status: 404 });

  // Candidate-Phone laden (mit Tenant-Prüfung, R4: agency_id-Scoping)
  const { data: candidate } = await svc
    .from('candidates')
    .select('phone_e164')
    .eq('id', conv.candidate_id)
    .eq('agency_id', agencyId)
    .single();

  if (!candidate?.phone_e164) {
    return NextResponse.json({ error: 'Telefonnummer nicht vorhanden' }, { status: 400 });
  }

  // Payload bauen
  let payload: import('@/lib/whatsapp/provider').SendMessagePayload;
  if (parsed.data.type === 'template' && parsed.data.templateId) {
    // Template laden (mit Tenant-Prüfung, R4: agency_id-Scoping)
    const { data: tmpl } = await svc
      .from('whatsapp_templates')
      .select('name, language')
      .eq('id', parsed.data.templateId)
      .eq('agency_id', agencyId)
      .single();

    if (!tmpl) return NextResponse.json({ error: 'Vorlage nicht gefunden' }, { status: 404 });

    const vars = parsed.data.templateVariables || {};
    const components = Object.keys(vars).length > 0 ? [{
      type: 'body',
      parameters: Object.values(vars).map(v => ({ type: 'text', text: v })),
    }] : [];

    payload = {
      to: candidate.phone_e164,
      type: 'template',
      template: {
        name: tmpl.name,
        language: { code: tmpl.language },
        components,
      },
    };
  } else {
    payload = {
      to: candidate.phone_e164,
      type: 'text',
      text: { body: parsed.data.body || '' },
    };
  }

  // C3: state update moved AFTER successful send — must not run when send throws
  // R4: sendWhatsAppMessage wirft bei Fehler (deutscher Error-Text) — try/catch
  try {
    const result = await sendWhatsAppMessage(svc, {
      agencyId,
      conversationId: conv.id,
      candidatePhone: candidate.phone_e164,
      waAccountId: conv.wa_account_id,
      payload,
      senderType: 'user',
      userId: user.id,
      templateId: parsed.data.templateId || null,
      isHumanUiSend: true,
    });

    // C3+C4: only update state after successful send; include agency_id scope
    if (parsed.data.type === 'text' && conv.state !== 'human_active') {
      await svc.from('conversations')
        .update({ state: 'human_active', updated_at: new Date().toISOString() })
        .eq('id', conv.id)
        .eq('agency_id', agencyId);

      // Bot-Pause: Recruiter-Nachricht pausiert den Bot (storniert ausstehende Timer)
      if (conv.state === 'bot_active') {
        await cancelBotTimers(svc, { agencyId, conversationId: conv.id });
      }
    }

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Senden fehlgeschlagen' },
      { status: 400 }
    );
  }
}
