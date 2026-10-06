import { NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/assistant/status – nur Admins: prüft mit einer Mini-Anfrage, ob der KI-Assistent
 * mit Schlüssel, Modell und Beta-Header live funktioniert, und nennt sonst den genauen Grund.
 */
export async function GET(req: Request) {
  // Admin oder interner Prüf-Token (system_einstellungen.sync_token)
  const token = req.headers.get('x-sync-token');
  let erlaubt = false;
  if (token) {
    const { data } = await createAdminClient().from('system_einstellungen').select('wert').eq('key', 'sync_token').maybeSingle();
    erlaubt = (data as { wert: string } | null)?.wert === token;
  }
  if (!erlaubt) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'admin') return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  }
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
