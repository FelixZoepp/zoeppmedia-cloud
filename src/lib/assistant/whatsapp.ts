/**
 * Zoepp-Assistent per WhatsApp: Felix schreibt der Zoepp-Nummer (dieselbe, die das CEO-Briefing schickt)
 * und bekommt Antworten aus der Cloud – Close-Kennzahlen, Quoten, Kunden, Team, Aufgaben.
 *
 * Sicherheit: Nur Nummern aus system_einstellungen.ceo_briefing.whatsapp (Absender kommt von Meta, nicht fälschbar
 * über die Nachricht). Jede andere Nummer – Kunden, Leads, Bewerber – läuft wie bisher in den Vertrieb.
 * Nur Lese-Werkzeuge der Admin-Rolle. Freigabe „whatsapp_assistent“ – aus: keine Antwort, Nachricht läuft normal weiter.
 * Testet Felix gerade eine Lead-Automatik (Lead-Nachricht an seine Nummer in den letzten 24 Std.), geht seine Antwort
 * in den Vertrieb, damit Tests weiter funktionieren – „Assistent: …“ erzwingt den Assistenten.
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { SupabaseClient } from '@supabase/supabase-js';
import { anthropicClient } from '@/lib/ai/anthropic';
import { getProvider } from '@/lib/whatsapp/provider';
import { decryptSecret } from '@/lib/crypto';
import { istFreigegeben } from '@/lib/freigaben';
import { isStopMessage } from '@/lib/whatsapp/window';
import { normalizeToE164, SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID } from '@/lib/sales/calendly-chain';
import { systemPromptFor } from './prompt';
import { toolsFor, type ToolContext } from './tools';

const MODEL = 'claude-opus-5-5';
const MAX_ROUNDS = 6;
/** Nach so langer Pause beginnt ein neues Gespräch */
const PAUSE_MS = 3 * 60 * 60_000;
/** Höchstens so viele Nachrichten (Frage + Antwort) im Verlauf */
const MAX_VERLAUF = 20;
const WA_MAX = 4000;

export interface AssistentJob {
  phone: string;
  message_id: string;
  text: string;
}

type Zug = { rolle: 'user' | 'assistant'; text: string };

/** „Assistent: …“ / „Zoepp: …“ erzwingt den Assistenten (rein, testbar) */
export function erzwungeneFrage(text: string): string | null {
  const m = /^\s*(zoepp[-\s]?)?(assistent|assi|zoepp)\s*[:,\-–]\s*([\s\S]+)$/i.exec(text);
  return m ? m[3].trim() : null;
}

/** Markdown aus dem Assistenten → WhatsApp-Format (*fett*, Listen mit •), in Stücke ≤ 4000 Zeichen (rein, testbar) */
export function fuerWhatsApp(text: string): string[] {
  const t = text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+(.+)$/gm, '*$1*')
    .replace(/^\s*[-*]\s+/gm, '• ')
    .replace(/\[([^\]]+)\]\((\/[^)]*)\)/g, '$1 (cloud.zoeppmedia.de$2)')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '$1 ($2)')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  const teile: string[] = [];
  let rest = t;
  while (rest.length > WA_MAX) {
    const schnitt = Math.max(rest.lastIndexOf('\n', WA_MAX), WA_MAX / 2);
    teile.push(rest.slice(0, schnitt).trim());
    rest = rest.slice(schnitt).trim();
  }
  if (rest) teile.push(rest);
  return teile;
}

async function chefNummern(svc: SupabaseClient): Promise<{ nummern: string[]; userIds: string[] }> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', 'ceo_briefing').maybeSingle();
  try {
    const w = (data as { wert: unknown } | null)?.wert;
    const obj = (typeof w === 'string' ? JSON.parse(w) : w) as { whatsapp?: string[]; user_ids?: string[] } | null;
    return { nummern: (obj?.whatsapp ?? []).map((n) => normalizeToE164(n)).filter((n): n is string => !!n), userIds: obj?.user_ids ?? [] };
  } catch {
    return { nummern: [], userIds: [] };
  }
}

/** Lief in den letzten 24 Std. eine Lead-Nachricht (Automatik/Inbox) an diese Nummer? Dann testet Felix gerade. */
async function testetGerade(svc: SupabaseClient, phone: string, jetzt: Date): Promise<boolean> {
  const { data: c } = await svc.from('candidates').select('id').eq('agency_id', SALES_AGENCY_ID).eq('phone_e164', phone).is('deleted_at', null);
  const ids = ((c ?? []) as Array<{ id: string }>).map((x) => x.id);
  if (!ids.length) return false;
  const { data: conv } = await svc.from('conversations').select('id').eq('wa_account_id', SALES_WA_ACCOUNT_ID).in('candidate_id', ids);
  const convIds = ((conv ?? []) as Array<{ id: string }>).map((x) => x.id);
  if (!convIds.length) return false;
  const { count } = await svc
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .in('conversation_id', convIds)
    .eq('direction', 'out')
    .gte('created_at', new Date(jetzt.getTime() - 24 * 60 * 60_000).toISOString());
  return !!count;
}

/**
 * Eingang auf der Zoepp-Nummer: gehört die Nachricht dem Assistenten? Dann Job einplanen und true.
 * false → normal weiter (Team-Befehle, Vertrieb).
 */
export async function nimmAssistentenNachricht(svc: SupabaseClient, msg: { id: string; type: string }, phone: string, text: string, jetzt: Date = new Date()): Promise<boolean> {
  if (msg.type !== 'text' || !text.trim()) return false;
  // Aufgaben-Diktat und STOP bleiben bei ihren eigenen Abläufen
  if (/^\s*(aufgaben?|to-?dos?)\s*[:\-–]/i.test(text) || isStopMessage(text)) return false;
  const ziel = normalizeToE164(phone);
  if (!ziel) return false;
  const { nummern } = await chefNummern(svc);
  if (!nummern.includes(ziel)) return false;
  if (!(await istFreigegeben(svc, 'whatsapp_assistent'))) return false;
  const erzwungen = erzwungeneFrage(text);
  if (!erzwungen && (await testetGerade(svc, ziel, jetzt))) return false;

  const { error } = await svc.from('scheduled_jobs').insert({
    agency_id: SALES_AGENCY_ID,
    type: 'assistent.whatsapp',
    run_at: jetzt.toISOString(),
    payload: { phone: ziel, message_id: msg.id, text: (erzwungen ?? text).slice(0, 4000) } satisfies AssistentJob,
    status: 'pending',
    dedupe_key: `assistent.whatsapp:${msg.id}`,
  });
  if (error && error.code !== '23505') throw new Error(`Assistent nicht eingeplant: ${error.message}`);
  return true;
}

/** Job assistent.whatsapp: Frage mit den Admin-Werkzeugen beantworten und per WhatsApp zurückschicken */
export async function beantworteAssistentenNachricht(svc: SupabaseClient, job: AssistentJob, jetzt: Date = new Date()): Promise<void> {
  const { data: acc } = await svc.from('whatsapp_accounts').select('access_token_enc, phone_number_id').eq('id', SALES_WA_ACCOUNT_ID).eq('agency_id', SALES_AGENCY_ID).single();
  const a = acc as { access_token_enc: string; phone_number_id: string } | null;
  if (!a) throw new Error('Sales-WhatsApp-Konto nicht gefunden');
  const token = decryptSecret(a.access_token_enc);
  const sende = async (body: string) => {
    for (const teil of fuerWhatsApp(body)) await getProvider().sendMessage(a.phone_number_id, token, { to: job.phone, type: 'text', text: { body: teil } });
  };

  // Nochmals prüfen (Einstellung kann sich seit dem Eingang geändert haben)
  const { nummern, userIds } = await chefNummern(svc);
  if (!nummern.includes(job.phone) || !(await istFreigegeben(svc, 'whatsapp_assistent'))) return;
  if (!process.env.ANTHROPIC_API_KEY) {
    await sende('Der Assistent ist gerade nicht eingerichtet (ANTHROPIC_API_KEY fehlt).');
    return;
  }

  // Nutzer: aus ceo_briefing.user_ids, sonst der einzige aktive Admin
  const { data: admins } = await svc.from('users').select('id, name, funktion').eq('role', 'admin').neq('aktiv', false);
  const liste = (admins ?? []) as Array<{ id: string; name: string; funktion: string | null }>;
  const user = liste.find((u) => userIds.includes(u.id)) ?? (liste.length === 1 ? liste[0] : null);
  if (!user) throw new Error('Kein eindeutiger Admin für den Assistenten (ceo_briefing.user_ids setzen)');

  // Verlauf laden (nach 3 Std. Pause neu)
  const { data: v } = await svc.from('assistent_whatsapp_verlauf').select('verlauf, aktualisiert_am').eq('telefon', job.phone).maybeSingle();
  const alt = v as { verlauf: Zug[]; aktualisiert_am: string } | null;
  const neuBeginnen = /^\s*(neu|reset|neues gespräch)\s*$/i.test(job.text);
  const verlauf: Zug[] = alt && !neuBeginnen && jetzt.getTime() - new Date(alt.aktualisiert_am).getTime() < PAUSE_MS ? alt.verlauf.slice(-MAX_VERLAUF) : [];
  if (neuBeginnen) {
    await svc.from('assistent_whatsapp_verlauf').upsert({ telefon: job.phone, verlauf: [], aktualisiert_am: jetzt.toISOString() });
    await sende('Alles klar, neues Gespräch. Was möchtest du wissen?');
    return;
  }

  const ctx: ToolContext = { svc, userId: user.id, audience: 'admin', agencyId: null, funktion: user.funktion };
  const defs = toolsFor('admin', user.funktion, false);
  const byName = new Map(defs.map((d) => [d.tool.name, d]));
  const heute = jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
  const messages: Anthropic.Beta.BetaMessageParam[] = [
    ...verlauf.map((z) => ({ role: z.rolle, content: z.text })),
    { role: 'user', content: `[Heute: ${heute} · Kanal: WhatsApp]\n\n${job.text}` },
  ];
  const system = `${systemPromptFor('admin', user.name, user.funktion)}

Kanal WhatsApp: Du bist der Zoepp-Assistent auf der Zoepp-Nummer – derselbe, der morgens das Briefing schickt. ${user.name.split(/\s+/)[0]} schreibt dir vom Handy.
- Antworte kurz wie in einem Chat: höchstens ca. 12 Zeilen, Zahlen zuerst, dann die eine wichtigste Einordnung.
- Kein Markdown außer **fett** und Listen mit „- “. Keine Tabellen, keine Überschriften.
- „Heute“, „gestern“, „diese Woche“ rechnest du selbst in Daten um (Europe/Berlin) und nutzt „sales_tage“; für Monat/Quartal „sales_kennzahlen“.`;

  const client = anthropicClient();
  let antwort = '';
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const msg = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      tools: defs.map((d) => d.tool),
      messages,
    });
    messages.push({ role: 'assistant', content: msg.content as Anthropic.Beta.BetaContentBlockParam[] });
    const text = msg.content.filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text').map((b) => b.text).join('');
    if (text.trim()) antwort = text;
    if (msg.stop_reason === 'refusal') {
      antwort = 'Dazu kann ich leider nichts sagen.';
      break;
    }
    if (msg.stop_reason === 'pause_turn') continue;
    const toolUses = msg.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (msg.stop_reason !== 'tool_use' || !toolUses.length) break;
    const results = await Promise.all(
      toolUses.map(async (t): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const def = byName.get(t.name);
        if (!def) return { type: 'tool_result', tool_use_id: t.id, is_error: true, content: 'Unbekanntes Werkzeug' };
        try {
          return { type: 'tool_result', tool_use_id: t.id, content: JSON.stringify(await def.run((t.input ?? {}) as Record<string, unknown>, ctx)).slice(0, 30000) };
        } catch (err) {
          console.error('[assistent-wa] Werkzeug fehlgeschlagen', t.name, err);
          return { type: 'tool_result', tool_use_id: t.id, is_error: true, content: 'Daten konnten gerade nicht geladen werden.' };
        }
      }),
    );
    messages.push({ role: 'user', content: results });
  }
  if (!antwort.trim()) antwort = 'Dazu habe ich gerade keine Antwort gefunden – frag gern noch einmal anders.';

  await sende(antwort);
  await svc.from('assistent_whatsapp_verlauf').upsert({
    telefon: job.phone,
    verlauf: [...verlauf, { rolle: 'user', text: job.text }, { rolle: 'assistant', text: antwort }].slice(-MAX_VERLAUF),
    aktualisiert_am: jetzt.toISOString(),
  });
}
