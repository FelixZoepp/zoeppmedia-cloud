import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext } from '@/lib/akademie/api';
import { kontextSauber, offeneCheckliste, protokolliereErledigtHinweis } from '@/lib/akademie/checklisten';
import { sopFuerSchritt } from '@/lib/akademie/hilfe-zuordnung';

/**
 * POST { stepKey, kontext } – offene Checklisten-Punkte zur Aufgabe (Hinweis vor „Erledigt“).
 * POST { stepKey, kontext, aktion: 'trotzdem' | 'zur_checkliste', offen } – Entscheidung protokollieren.
 */
export async function POST(req: NextRequest) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => ({}))) as { stepKey?: unknown; kontext?: unknown; aktion?: unknown; offen?: unknown };
  const slug = sopFuerSchritt(typeof body.stepKey === 'string' ? body.stepKey : null);
  if (!slug) return NextResponse.json({ slug: null, offen: [] });
  const kontext = kontextSauber(body.kontext);
  if (body.aktion === 'trotzdem' || body.aktion === 'zur_checkliste') {
    const offen = Array.isArray(body.offen) ? body.offen.filter((x): x is string => typeof x === 'string') : [];
    await protokolliereErledigtHinweis(k.svc, k.user.id, slug, kontext, offen, body.aktion);
    return NextResponse.json({ ok: true });
  }
  const r = await offeneCheckliste(k.svc, k.zugriff, k.user.id, slug, kontext).catch(() => null);
  if (!r) return NextResponse.json({ slug: null, offen: [] });
  return NextResponse.json({ slug, titel: r.titel, offen: r.offen });
}
