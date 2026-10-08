import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfUmsatz } from '@/lib/umsatz/zugriff';
import { berechneUmsatz, zeitraumFuer } from '@/lib/umsatz/berechnung';
import { ladeAbschluesse, ladeKunden, ladeRechnungen } from '@/lib/umsatz/laden';
import { berlinTag } from '@/lib/zeit/berlin';

export const maxDuration = 120;

const AUSWAHL = ['monat', 'quartal', 'jahr', '12m'] as const;

/** Umsatz-Analyse: Lexware-Rechnungen + Kunden + Close-Abschlüsse (Lexware/Close intern 10 Min. gecacht) */
export async function GET(req: NextRequest) {
  if (!(await darfUmsatz())) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });

  const gewaehlt = req.nextUrl.searchParams.get('zeitraum') ?? '';
  const auswahl = (AUSWAHL as readonly string[]).includes(gewaehlt) ? gewaehlt : '12m';
  const heute = berlinTag();
  const { zeitraum, vorperiode, label } = zeitraumFuer(auswahl, heute);

  const svc = createAdminClient();
  const [rechnungen, { kunden, fakturiert }, abschluesse] = await Promise.all([
    ladeRechnungen().catch((err) => {
      console.error('[umsatz] Lexware', err);
      return null;
    }),
    ladeKunden(svc),
    ladeAbschluesse(),
  ]);

  if (!rechnungen) {
    return NextResponse.json(
      { error: process.env.LEXOFFICE_API_KEY ? 'Lexware ist gerade nicht erreichbar – bitte später erneut versuchen.' : 'Lexware ist nicht verbunden (LEXOFFICE_API_KEY fehlt).' },
      { status: 503 },
    );
  }

  const analyse = berechneUmsatz({
    rechnungen,
    kunden,
    fakturiert,
    abschluesse: abschluesse ?? [],
    zeitraum,
    vorperiode,
    heute,
    closeVerbunden: abschluesse !== null,
  });
  return NextResponse.json({ auswahl, label, ...analyse });
}
