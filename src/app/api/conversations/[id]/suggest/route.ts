/**
 * POST /api/conversations/[id]/suggest
 *
 * Generiert einen KI-Antwortsvorschlag für den Recruiter.
 * Phase 3 Task 11.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { llmTextCall, DIALOG_MODEL } from '@/lib/ai/llm-client';
import { PROMPT_VERSION } from '@/lib/bot/prompt';

const SUGGEST_SYSTEM =
  'Du bist ein Assistent für Recruiter. Formuliere eine kurze, freundliche WhatsApp-Antwort auf Deutsch in Du-Form. Höchstens 3 Sätze. Antworte NUR mit dem Nachrichtentext.';

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: conversationId } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!canWriteRole(user.role)) return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const svc = createAdminClient();

  // Conversation laden (mit Tenant-Prüfung)
  const { data: conv } = await svc
    .from('conversations')
    .select(`
      id,
      candidate:candidates(name),
      application:applications(job:jobs(title))
    `)
    .eq('id', conversationId)
    .eq('agency_id', agencyId)
    .single();

  if (!conv) return NextResponse.json({ error: 'Konversation nicht gefunden' }, { status: 404 });

  // Letzte 20 Nachrichten laden
  const { data: messages } = await svc
    .from('messages')
    .select('direction, sender_type, body, created_at')
    .eq('conversation_id', conversationId)
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(20);

  const chronological = (messages ?? []).reverse();

  // Kandidatenname und Jobtitel
  const convTyped = conv as unknown as {
    candidate: { name: string } | null;
    application: Array<{ job: { title: string } | null }> | null;
  };
  const candidateName = convTyped.candidate?.name ?? 'Kandidat';
  const jobTitle = convTyped.application?.[0]?.job?.title ?? 'unbekannte Stelle';

  // Messages für LLM bauen: Rollen beschriften
  const labeledHistory = chronological
    .map((m: { direction: string; sender_type: string; body: string | null }) => {
      const who =
        m.direction === 'in'
          ? 'Kandidat'
          : m.sender_type === 'bot'
          ? 'Bot'
          : 'Recruiter';
      return `${who}: ${m.body ?? ''}`;
    })
    .join('\n');

  const userContent = [
    `Kandidat: ${candidateName}`,
    `Stelle: ${jobTitle}`,
    '',
    'Gesprächsverlauf (neueste zuletzt):',
    labeledHistory,
  ].join('\n');

  const suggestion = await llmTextCall(svc, {
    agencyId,
    conversationId,
    purpose: 'suggest',
    model: DIALOG_MODEL,
    promptVersion: PROMPT_VERSION,
    system: [{ text: SUGGEST_SYSTEM }],
    messages: [{ role: 'user', content: userContent }],
    maxTokens: 256,
  });

  return NextResponse.json({ suggestion });
}
