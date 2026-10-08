import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';

/** GET – Wissenslücken nach Häufigkeit (nur Admin) */
export async function GET() {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { data } = await k.svc
    .from('akademie_luecken')
    .select('id, frage, anzahl, positionen, status, artikel_slug, zuletzt_am')
    .order('status')
    .order('anzahl', { ascending: false })
    .limit(200);
  return NextResponse.json({ luecken: data ?? [] });
}

/** PATCH { id, status } – Lücke erledigt/ignoriert/offen (nur Admin) */
export async function PATCH(req: NextRequest) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown; status?: unknown };
  if (typeof body.id !== 'string' || !['offen', 'erledigt', 'ignoriert'].includes(String(body.status))) return fehler('Ungültige Eingabe');
  const { error } = await k.svc.from('akademie_luecken').update({ status: body.status }).eq('id', body.id);
  if (error) return fehler(error.message, 500);
  return NextResponse.json({ ok: true });
}
