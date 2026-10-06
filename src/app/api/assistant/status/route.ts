import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getCurrentUser } from '@/lib/auth';

/**
 * GET /api/assistant/status – nur Admins: prüft mit einer Mini-Anfrage, ob der KI-Assistent
 * mit Schlüssel, Modell und Beta-Header live funktioniert, und nennt sonst den genauen Grund.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ ok: false, grund: 'ANTHROPIC_API_KEY ist in Vercel nicht gesetzt.' });
  }
  const start = Date.now();
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const msg = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 64,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Antworte nur mit: ok' }],
    });
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    return NextResponse.json({ ok: true, modell: msg.model, antwort: text, dauer_ms: Date.now() - start });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      grund:
        err instanceof Anthropic.APIError
          ? `${err.status ?? '–'}: ${err.message}`
          : err instanceof Error
            ? err.message
            : String(err),
      dauer_ms: Date.now() - start,
    });
  }
}
