import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';
import { ladeTeam } from '@/lib/aufgaben/boards';
import { erkenneAufgaben, ladeKundenKurz } from '@/lib/aufgaben/diktat';
import { randomUUID } from 'node:crypto';
import { transcribeAudio } from '@/lib/recordings/transcribe';

export const maxDuration = 120;

/** POST FormData { audio? (Datei), text? } – transkribieren + Aufgaben erkennen (Vorschau, legt nichts an) */
export async function POST(req: NextRequest) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: 'Keine Daten' }, { status: 400 });
  const datei = form.get('audio');
  let text = typeof form.get('text') === 'string' ? String(form.get('text')).trim() : '';
  try {
    if (!text && datei instanceof File && datei.size > 0) {
      if (datei.size > 24 * 1024 * 1024) return NextResponse.json({ error: 'Aufnahme zu lang (max. ca. 20 Minuten)' }, { status: 400 });
      const name = datei.name && /\.\w+$/.test(datei.name) ? datei.name : 'diktat.webm';
      text = (await transcribeAudio(Buffer.from(await datei.arrayBuffer()), name)).trim();
    }
    if (!text) return NextResponse.json({ error: 'Nichts verstanden – bitte nochmal aufnehmen' }, { status: 400 });
    const svc = createAdminClient();
    const [team, kunden] = await Promise.all([ladeTeam(svc), ladeKundenKurz(svc)]);
    const erg = await erkenneAufgaben(text, team, { id: user.id, name: user.name ?? 'Felix' }, new Date(), kunden);
    const ref = `cloud:${randomUUID()}`;
    await svc.from('aufgaben_sprachnachrichten').insert({ user_id: user.id, quelle: 'cloud', transkript: text, ergebnis: erg, ref });
    return NextResponse.json({ transkript: text, ref, kunden, ...erg });
  } catch (err) {
    console.error('[boards/sprachnachricht]', err);
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 502 });
  }
}
