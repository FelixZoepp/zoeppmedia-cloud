import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { beantworteFrage } from '@/lib/akademie/bot';
import { checkRateLimit } from '@/lib/security/rate-limit';

export const maxDuration = 60;

/** POST { frage } – Akademie-Bot (nur Freigeschaltetes) */
export async function POST(req: NextRequest) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => ({}))) as { frage?: unknown };
  const frage = typeof body.frage === 'string' ? body.frage.trim() : '';
  if (frage.length < 3) return fehler('Bitte eine Frage stellen');
  if (!(await checkRateLimit(k.svc, `akademie-bot:${k.user.id}`, 30, 60 * 60))) return fehler('Zu viele Fragen in kurzer Zeit – bitte etwas warten', 429);
  try {
    const antwort = await beantworteFrage(k.svc, { id: k.user.id, role: k.user.role, funktion: k.user.funktion ?? null }, frage, { zugriff: k.zugriff });
    return NextResponse.json(antwort);
  } catch (err) {
    console.error('[akademie-bot]', err);
    return fehler('Der Bot ist gerade nicht erreichbar', 502);
  }
}

/** GET – letzte Bot-Antworten mit Bewertung (nur Admin) */
export async function GET() {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { data } = await k.svc
    .from('akademie_bot_antworten')
    .select('id, frage, antwort, quellen, luecke, bewertung, created_at, user:users(name)')
    .order('created_at', { ascending: false })
    .limit(100);
  return NextResponse.json({ antworten: data ?? [] });
}
