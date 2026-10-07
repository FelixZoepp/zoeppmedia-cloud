import { NextRequest, NextResponse, after } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { fehlendeAngaben, ladeBriefing } from '@/lib/indeed/anzeige';
import { bausteineVon } from '@/lib/fulfillment/pakete';
import { TEILE, fuehreGenerierungAus, starteGenerierung, teileFuer } from '@/lib/fulfillment/generator';

// Teile laufen parallel im Hintergrund – Opus braucht je Teil bis zu ~1–2 Minuten
export const maxDuration = 300;

type Ctx = { params: Promise<{ id: string }> };

/** GET – Briefing-Stand, was erzeugt würde, letzte Generierung mit Fortschritt und die Inhalte (Funnel, Webseiten-Video) */
export async function GET(_req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const svc = createAdminClient();
  const [briefing, { data: ag }, { data: gen }, { data: inhalte }] = await Promise.all([
    ladeBriefing(svc, id),
    svc.from('agencies').select('bausteine').eq('id', id).maybeSingle(),
    svc.from('fulfillment_generierungen').select('id, status, teile, gestartet_am, fertig_am').eq('agency_id', id).order('gestartet_am', { ascending: false }).limit(1).maybeSingle(),
    svc.from('fulfillment_inhalte').select('id, art, inhalt, created_at').eq('agency_id', id).order('created_at', { ascending: false }).limit(20),
  ]);
  if (!briefing) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
  const teile = teileFuer(bausteineVon((ag as { bausteine?: unknown } | null)?.bausteine));
  const neueste = (art: string) => ((inhalte ?? []) as Array<{ art: string }>).find((x) => x.art === art) ?? null;
  return NextResponse.json({
    fehlend: fehlendeAngaben(briefing),
    teile: TEILE.filter((t) => teile.includes(t.key)),
    generierung: gen ?? null,
    funnel: neueste('funnel'),
    webseitenVideo: neueste('webseiten_video'),
  });
}

/** POST { zusatz? } – Fulfillment-Paket erzeugen (läuft im Hintergrund weiter) */
export async function POST(req: NextRequest, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { zusatz?: string };
  const zusatz = body.zusatz?.trim().slice(0, 8000) || null;
  const svc = createAdminClient();

  const briefing = await ladeBriefing(svc, id);
  if (!briefing) return NextResponse.json({ error: 'Kunde nicht gefunden' }, { status: 404 });
  if (!briefing.jobtitel && !zusatz) {
    return NextResponse.json({ error: 'Es fehlt mindestens die Stellenbezeichnung – Onboarding-Formular ausfüllen lassen oder Infos aus dem Gespräch eintragen.' }, { status: 400 });
  }
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'ANTHROPIC_API_KEY ist nicht hinterlegt' }, { status: 503 });

  try {
    const { id: genId, teile } = await starteGenerierung(svc, id, user.id, zusatz);
    if (!teile.length) return NextResponse.json({ error: 'Für die gebuchten Leistungen gibt es nichts zu generieren' }, { status: 400 });
    after(() => fuehreGenerierungAus(createAdminClient(), genId, id, user.id, teile, zusatz));
    return NextResponse.json({ id: genId, teile });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 409 });
  }
}
