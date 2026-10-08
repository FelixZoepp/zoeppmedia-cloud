import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { fragenOhneLoesung, WISSENSCHECKS } from '@/lib/akademie/wissenscheck';
import { letzterWissenscheck, speichereWissenscheck } from '@/lib/akademie/checklisten';

type Ctx = { params: Promise<{ bereich: string }> };

function erlaubt(bereich: string, k: { zugriff: { admin: boolean; positionen: Set<string> } }) {
  return !!WISSENSCHECKS[bereich] && (k.zugriff.admin || k.zugriff.positionen.has(bereich));
}

/** GET – Fragen (ohne Lösung) und mein letztes Ergebnis */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const { bereich } = await params;
  if (!erlaubt(bereich, k)) return fehler('Nicht freigeschaltet', 404);
  return NextResponse.json({ fragen: fragenOhneLoesung(bereich), letztes: await letzterWissenscheck(k.svc, k.user.id, bereich) });
}

/** POST { antworten: { [frageId]: optionIndex } } – auswerten und speichern */
export async function POST(req: NextRequest, { params }: Ctx) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const { bereich } = await params;
  if (!erlaubt(bereich, k)) return fehler('Nicht freigeschaltet', 404);
  const body = (await req.json().catch(() => ({}))) as { antworten?: Record<string, unknown> };
  const antworten = Object.fromEntries(Object.entries(body.antworten ?? {}).filter(([, v]) => Number.isInteger(v)).map(([key, v]) => [key, v as number]));
  return NextResponse.json(await speichereWissenscheck(k.svc, k.user.id, bereich, antworten));
}
