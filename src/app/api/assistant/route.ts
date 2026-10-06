import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getCurrentUser, getEffectiveAgencyId, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { audienceFor } from '@/lib/help/articles';
import { toolsFor, type ToolContext } from '@/lib/assistant/tools';
import { systemPromptFor } from '@/lib/assistant/prompt';

export const maxDuration = 120;

const MODEL = 'claude-opus-5-5';
/** Höchstens so viele Werkzeug-Runden pro Frage */
const MAX_ROUNDS = 6;
/** Verlauf begrenzen, damit Anfragen nicht beliebig wachsen */
const MAX_HISTORY = 40;

type Event =
  | { type: 'text'; delta: string }
  | { type: 'tool'; label: string }
  | { type: 'done'; messages: Anthropic.Beta.BetaMessageParam[] }
  | { type: 'error'; message: string };

/**
 * KI-Assistent: agentische Schleife über eigene, rollen-gebundene Lese-Werkzeuge.
 * Antwortet als NDJSON-Stream (Text-Deltas, Werkzeug-Hinweise, am Ende der vollständige Verlauf).
 * Der Verlauf wird unverändert zurückgegeben und vom Browser beim nächsten Mal mitgeschickt
 * (append-only, damit Denk-Blöcke gültig bleiben).
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'KI ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt)' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { messages?: unknown; question?: unknown; page?: unknown };
  const question = typeof body.question === 'string' ? body.question.trim().slice(0, 4000) : '';
  if (!question) return NextResponse.json({ error: 'Frage fehlt' }, { status: 400 });
  const history = Array.isArray(body.messages) ? (body.messages as Anthropic.Beta.BetaMessageParam[]) : [];
  if (history.length > MAX_HISTORY) {
    return NextResponse.json({ error: 'Das Gespräch ist sehr lang geworden – bitte ein neues beginnen.' }, { status: 400 });
  }
  const page = typeof body.page === 'string' ? body.page.slice(0, 200) : '/';

  const audience = audienceFor(user.role);
  const ctx: ToolContext = {
    svc: createAdminClient(),
    userId: user.id,
    audience,
    agencyId: isInternal(user.role) ? null : await getEffectiveAgencyId(),
  };
  const defs = toolsFor(audience);
  const tools = defs.map((d) => d.tool);
  const byName = new Map(defs.map((d) => [d.tool.name, d]));

  // Datum und Seite als eigener Block nach dem stabilen (gecachten) System-Prompt
  const heute = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...history,
    { role: 'user', content: `[Heute: ${heute} · Seite: ${page}]\n\n${question}` },
  ];

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: Event) => controller.enqueue(encoder.encode(JSON.stringify(e) + '\n'));
      try {
        for (let round = 0; round < MAX_ROUNDS; round++) {
          const s = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'low' },
            system: [{ type: 'text', text: systemPromptFor(audience, user.name), cache_control: { type: 'ephemeral' } }],
            tools,
            messages,
          });
          s.on('text', (delta) => send({ type: 'text', delta }));
          const msg = await s.finalMessage();
          messages.push({ role: 'assistant', content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });

          if (msg.stop_reason === 'refusal') {
            send({ type: 'text', delta: '\n\nDazu kann ich leider nichts sagen.' });
            break;
          }
          if (msg.stop_reason === 'pause_turn') continue;

          const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
          if (msg.stop_reason !== 'tool_use' || toolUses.length === 0) break;

          // Alle Werkzeuge parallel ausführen, Ergebnisse in EINER Nachricht zurückgeben
          const results = await Promise.all(
            toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
              const def = byName.get(t.name);
              if (!def) return { type: 'tool_result', tool_use_id: t.id, is_error: true, content: 'Unbekanntes Werkzeug' };
              send({ type: 'tool', label: def.label });
              try {
                const out = await def.run((t.input ?? {}) as Record<string, unknown>, ctx);
                return { type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(out).slice(0, 30000) };
              } catch (err) {
                console.error('[assistant] Werkzeug fehlgeschlagen', t.name, err);
                return { type: 'tool_result', tool_use_id: t.id, is_error: true, content: 'Daten konnten gerade nicht geladen werden.' };
              }
            }),
          );
          messages.push({ role: 'user', content: results });
          if (round === MAX_ROUNDS - 1) send({ type: 'text', delta: '\n\n(Ich habe hier abgebrochen, um nicht zu lange zu suchen.)' });
        }
        send({ type: 'done', messages });
      } catch (err) {
        console.error('[assistant]', err);
        const message =
          err instanceof Anthropic.RateLimitError
            ? 'Gerade sind zu viele Anfragen unterwegs – bitte gleich noch einmal versuchen.'
            : err instanceof Anthropic.APIError
              ? 'Die KI ist gerade nicht erreichbar. Bitte später erneut versuchen.'
              : 'Etwas ist schiefgelaufen.';
        // Admins sehen den technischen Grund, damit sich Fehler (Schlüssel, Modell, Limits) schnell finden lassen
        const detail =
          user.role === 'admin'
            ? err instanceof Anthropic.APIError
              ? ` (Technisch: ${err.status ?? '–'} ${err.message.slice(0, 300)})`
              : err instanceof Error
                ? ` (Technisch: ${err.message.slice(0, 300)})`
                : ''
            : '';
        send({ type: 'error', message: message + detail });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
