import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { signalSafe, isSignalSatisfied } from '@/lib/fulfillment/engine';
import { erzeugeBilderFuerAd, variantenMitVorschau, waehleVariante, type BildVariante } from '@/lib/ads/bilder';

export const maxDuration = 120;

async function antwort(id: string) {
  const svc = createAdminClient();
  const { data } = await svc.from('ad_items').select('agency_id, asset_path, bild_varianten, bilder_status').eq('id', id).maybeSingle();
  const ad = data as { agency_id: string; asset_path: string | null; bild_varianten: BildVariante[] | null; bilder_status: string | null } | null;
  if (!ad) return NextResponse.json({ error: 'Ad nicht gefunden' }, { status: 404 });
  return NextResponse.json({
    varianten: await variantenMitVorschau(svc, ad.bild_varianten),
    ausgewaehlt: ad.asset_path,
    status: ad.bilder_status,
  });
}

/** Bildvarianten einer Ad mit Vorschau */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  return antwort((await params).id);
}

/** POST { neu?: true } – KI-Bilder erzeugen (fehlende ergänzen bzw. mit neu: kompletten neuen Satz) */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const { neu } = (await req.json().catch(() => ({}))) as { neu?: boolean };
  const svc = createAdminClient();
  const r = await erzeugeBilderFuerAd(svc, id, { force: neu === true });
  if (r.ergebnis === 'uebersprungen') return NextResponse.json({ error: 'Für diese Ad können keine KI-Bilder erzeugt werden (nur Grafik-Ads vor der Freigabe).' }, { status: 400 });
  if (r.ergebnis === 'laeuft') return NextResponse.json({ error: 'Die Bilder werden gerade schon erzeugt.' }, { status: 409 });
  if (r.ergebnis === 'kein_schluessel' || r.ergebnis === 'limit') return NextResponse.json({ error: r.meldung }, { status: 409 });
  if (r.ergebnis === 'fehler') return NextResponse.json({ error: r.meldung ?? 'Bilderzeugung fehlgeschlagen – bitte erneut versuchen' }, { status: 502 });
  const { data } = await svc.from('ad_items').select('agency_id').eq('id', id).maybeSingle();
  const agencyId = (data as { agency_id: string } | null)?.agency_id;
  if (agencyId && (await isSignalSatisfied(svc, agencyId, 'grafiken_fertig').catch(() => false))) await signalSafe(svc, agencyId, 'grafiken_fertig');
  return antwort(id);
}

/** PATCH { pfad } – Variante auswählen */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  const { id } = await params;
  const { pfad } = (await req.json().catch(() => ({}))) as { pfad?: string };
  if (!pfad) return NextResponse.json({ error: 'pfad fehlt' }, { status: 400 });
  try {
    await waehleVariante(createAdminClient(), id, pfad);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Fehler' }, { status: 400 });
  }
  return antwort(id);
}
