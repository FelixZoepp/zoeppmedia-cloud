import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getCurrentUser } from '@/lib/auth';
import { sanitizeLessonHtml } from '@/lib/masterclass/lesson';

export const maxDuration = 120;

const Vorschlag = z.object({
  kurzbeschreibung: z.string(),
  inhalt_html: z.string(),
  tags: z.array(z.string()),
  kapitel: z.array(z.object({ sekunden: z.number(), titel: z.string() })),
});

const SYSTEM = `Du schreibst Lektionen für die Vertriebs- und Recruiting-Masterclass von Zoepp Media (Kunden sind Vertriebs- und D2D-Agenturen).
Schreibe auf Deutsch, per Du, klar und praxisnah.
- kurzbeschreibung: 1–2 Sätze, höchstens 250 Zeichen, was man in der Lektion lernt.
- inhalt_html: Begleittext zur Lektion mit den wichtigsten Punkten. Erlaubt sind nur <p>, <strong>, <em>, <ul>, <ol>, <li>, <h3>. 120–350 Wörter. Keine Erfindungen über Inhalte, die nicht aus Titel oder Notizen hervorgehen – bleib dann allgemein.
- tags: 2–6 kurze Schlagworte.
- kapitel: nur wenn die Notizen Zeitmarken enthalten (z. B. „01:15 Einwände“), sonst leere Liste. sekunden = Startzeit in Sekunden.`;

/** KI füllt Kurzbeschreibung, Inhalt, Tags (und Kapitel aus Zeitmarken) für eine Lektion vor – nur Admin. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'KI ist nicht eingerichtet (ANTHROPIC_API_KEY fehlt)' }, { status: 503 });

  const body = (await req.json().catch(() => ({}))) as { titel?: unknown; modul?: unknown; notizen?: unknown; beschreibung?: unknown };
  const titel = typeof body.titel === 'string' ? body.titel.trim().slice(0, 200) : '';
  if (!titel) return NextResponse.json({ error: 'Bitte zuerst einen Namen für die Lektion eintragen' }, { status: 400 });
  const modul = typeof body.modul === 'string' ? body.modul.slice(0, 200) : '';
  const notizen = typeof body.notizen === 'string' ? body.notizen.slice(0, 40_000) : '';
  const beschreibung = typeof body.beschreibung === 'string' ? body.beschreibung.slice(0, 2000) : '';

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const res = await client.messages.parse({
      model: 'claude-opus-5-5',
      max_tokens: 8000,
      output_config: { effort: 'medium', format: zodOutputFormat(Vorschlag) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: `Modul: ${modul || '–'}\nLektion: ${titel}\nBisherige Kurzbeschreibung: ${beschreibung || '–'}\n\nNotizen / Transkript:\n${notizen || '(keine)'}`,
        },
      ],
    });
    if (res.stop_reason === 'refusal' || !res.parsed_output) {
      return NextResponse.json({ error: 'Die KI konnte dazu keinen Vorschlag machen.' }, { status: 422 });
    }
    const v = res.parsed_output;
    return NextResponse.json({
      kurzbeschreibung: v.kurzbeschreibung.slice(0, 300),
      inhalt_html: sanitizeLessonHtml(v.inhalt_html),
      tags: v.tags.map((t) => t.trim()).filter(Boolean).slice(0, 6),
      kapitel: v.kapitel
        .filter((k) => k.sekunden >= 0 && k.titel.trim())
        .map((k) => ({ sekunden: Math.round(k.sekunden), titel: k.titel.trim().slice(0, 120) })),
    });
  } catch (err) {
    console.error('[masterclass/ai]', err);
    const message = err instanceof Anthropic.RateLimitError ? 'Gerade zu viele Anfragen – bitte gleich noch einmal.' : 'Die KI ist gerade nicht erreichbar.';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
