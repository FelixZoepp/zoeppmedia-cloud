import { NextRequest, NextResponse } from 'next/server';
import { akademieKontext, fehler } from '@/lib/akademie/api';
import { hilfeFuer, kontextSauber, ladeHilfeModus, setzeHilfeModus } from '@/lib/akademie/checklisten';

/** GET ?pfad=&step=&kontext= – Hilfe-Modus-Stand und passende SOPs (nur Freigeschaltetes) */
export async function GET(req: NextRequest) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const sp = req.nextUrl.searchParams;
  const pfad = (sp.get('pfad') ?? '').slice(0, 300);
  const hilfeModus = await ladeHilfeModus(k.svc, k.user.id, k.zugriff.admin);
  // Ohne Hilfe-Modus nur den Stand liefern – außer die Leiste wird bewusst geöffnet (offen=1)
  if (!hilfeModus && sp.get('offen') !== '1') return NextResponse.json({ hilfeModus, themen: [], zugeordnet: false, keineAnleitung: false });
  try {
    const step = sp.get('step');
    const r = await hilfeFuer(k.svc, k.zugriff, k.user.id, {
      pfad,
      stepKey: step,
      kontext: kontextSauber(sp.get('kontext') ?? `pfad:${pfad}`),
      meldeLuecke: !!step || sp.get('offen') === '1',
    });
    return NextResponse.json({ hilfeModus, ...r });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : 'Fehler', 500);
  }
}

/** POST { hilfeModus: boolean } – Hilfe-Modus für mich an/aus */
export async function POST(req: NextRequest) {
  const k = await akademieKontext();
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => ({}))) as { hilfeModus?: unknown };
  if (typeof body.hilfeModus !== 'boolean') return fehler('hilfeModus fehlt');
  await setzeHilfeModus(k.svc, k.user.id, body.hilfeModus);
  return NextResponse.json({ ok: true, hilfeModus: body.hilfeModus });
}
