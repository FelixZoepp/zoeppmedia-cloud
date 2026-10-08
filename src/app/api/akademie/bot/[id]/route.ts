import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH { bewertung: 1 | -1 } – Daumen hoch/runter für die eigene Antwort */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { bewertung?: unknown };
  if (body.bewertung !== 1 && body.bewertung !== -1) return fehler('bewertung muss 1 oder -1 sein');
  const { error } = await k.svc.from('akademie_bot_antworten').update({ bewertung: body.bewertung }).eq('id', id).eq('user_id', k.user.id);
  if (error) return fehler(error.message, 500);
  return NextResponse.json({ ok: true });
}
