import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { internerNutzer } from '@/lib/aufgaben/zugriff';

/** POST { version_id, zeit_s?, zeit_bis_s?, text } – Kommentar (zeitgenau, für einen Zeitbereich oder allgemein) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await internerNutzer();
  if (!user) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const b = (await req.json().catch(() => ({}))) as { version_id?: string; zeit_s?: number | null; zeit_bis_s?: number | null; text?: string };
  const text = b.text?.trim();
  if (!text) return NextResponse.json({ error: 'Kommentar ist leer' }, { status: 400 });
  const zeitS = typeof b.zeit_s === 'number' && Number.isFinite(b.zeit_s) && b.zeit_s >= 0 ? Math.round(b.zeit_s * 100) / 100 : null;
  const bis = typeof b.zeit_bis_s === 'number' && Number.isFinite(b.zeit_bis_s) ? Math.round(b.zeit_bis_s * 100) / 100 : null;
  const { data, error } = await createAdminClient()
    .from('video_kommentare')
    .insert({
      video_id: id,
      version_id: b.version_id ?? null,
      zeit_s: zeitS,
      // Bereich nur, wenn das Ende hinter dem Start liegt
      zeit_bis_s: zeitS !== null && bis !== null && bis > zeitS ? bis : null,
      text: text.slice(0, 3000),
      autor_id: user.id,
    })
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
