import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { pruefeReview } from '@/lib/akademie/checklisten';

type Ctx = { params: Promise<{ id: string }> };

/** PATCH (Admin) { ergebnis: 'geprueft' | 'nacharbeit', kommentar? } – Review prüfen */
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext({ admin: true });
  if (k instanceof NextResponse) return k;
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { ergebnis?: unknown; kommentar?: unknown };
  if (body.ergebnis !== 'geprueft' && body.ergebnis !== 'nacharbeit') return fehler('ergebnis muss geprueft oder nacharbeit sein');
  await pruefeReview(k.svc, id, k.user.id, body.ergebnis, typeof body.kommentar === 'string' ? body.kommentar : null);
  return NextResponse.json({ ok: true });
}
