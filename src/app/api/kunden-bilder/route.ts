import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfOnboardingSchreiben } from '@/lib/onboarding/body';
import { BILDER_BUCKET, MAX_BILDER_PRO_UPLOAD, bildName, bildPfad, istEigenerBildPfad, istKategorie, planeBilderMeldung, pruefeBild } from '@/lib/kunden-bilder';

/**
 * Bilder vom Kunden (privat, Bucket kunden-bilder).
 * POST {mime, groesse}                         → signierter Upload-Link für den eigenen Kunden
 * PUT  {bilder: [{pfad, dateiname, kategorie}]} → hochgeladene Bilder eintragen + Slack-Meldung einplanen
 * GET  ?agencyId=                              → Bilder mit Vorschau-Links (1 Std.); fremde Kunden nur fürs interne Team
 * DELETE ?id=                                  → eigenes Bild entfernen
 */

async function eigenerKunde(): Promise<{ agencyId: string; userId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  if (!user.agency_id) return NextResponse.json({ error: 'Kein Kunde zugeordnet' }, { status: 400 });
  if (!darfOnboardingSchreiben(user.role)) return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 403 });
  return { agencyId: user.agency_id, userId: user.id };
}

export async function POST(req: NextRequest) {
  const k = await eigenerKunde();
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => ({}))) as { mime?: unknown; groesse?: unknown };
  const fehler = pruefeBild(body.mime, body.groesse);
  if (fehler) return NextResponse.json({ error: fehler }, { status: 400 });
  const pfad = bildPfad(k.agencyId, body.mime as string);
  const { data, error } = await createAdminClient().storage.from(BILDER_BUCKET).createSignedUploadUrl(pfad);
  if (error || !data) return NextResponse.json({ error: 'Upload gerade nicht möglich' }, { status: 500 });
  return NextResponse.json({ pfad, token: data.token, bucket: BILDER_BUCKET });
}

export async function PUT(req: NextRequest) {
  const k = await eigenerKunde();
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => ({}))) as { bilder?: Array<{ pfad?: unknown; dateiname?: unknown; kategorie?: unknown }> };
  const bilder = (Array.isArray(body.bilder) ? body.bilder : []).slice(0, MAX_BILDER_PRO_UPLOAD);
  const gueltig = bilder.filter((b) => istEigenerBildPfad(b.pfad, k.agencyId) && istKategorie(b.kategorie));
  if (!gueltig.length) return NextResponse.json({ error: 'Keine gültigen Bilder' }, { status: 400 });

  const svc = createAdminClient();
  // Nur eintragen, was wirklich im Speicher liegt
  const { data: liste } = await svc.storage.from(BILDER_BUCKET).list(k.agencyId, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
  const vorhanden = new Set((liste ?? []).map((o) => `${k.agencyId}/${o.name}`));
  const zeilen = gueltig
    .filter((b) => vorhanden.has(b.pfad as string))
    .map((b) => ({ agency_id: k.agencyId, pfad: b.pfad as string, kategorie: b.kategorie as string, dateiname: bildName(b.dateiname), hochgeladen_von: k.userId }));
  if (!zeilen.length) return NextResponse.json({ error: 'Bilder nicht gefunden – bitte erneut hochladen' }, { status: 400 });

  const { error } = await svc.from('kunden_bilder').upsert(zeilen, { onConflict: 'pfad', ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  await planeBilderMeldung(svc, k.agencyId).catch((e) => console.error('[kunden-bilder] Meldung nicht geplant:', e));
  return NextResponse.json({ ok: true, anzahl: zeilen.length });
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  const gewuenscht = req.nextUrl.searchParams.get('agencyId');
  const agencyId = gewuenscht && isInternal(user.role) ? gewuenscht : user.agency_id;
  if (!agencyId) return NextResponse.json({ error: 'Kein Kunde zugeordnet' }, { status: 400 });

  const svc = createAdminClient();
  const { data } = await svc
    .from('kunden_bilder')
    .select('id, pfad, kategorie, dateiname, created_at')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(300);
  const zeilen = (data ?? []) as Array<{ id: string; pfad: string; kategorie: string; dateiname: string | null; created_at: string }>;
  const urls = new Map<string, string>();
  if (zeilen.length) {
    const { data: s } = await svc.storage.from(BILDER_BUCKET).createSignedUrls(zeilen.map((z) => z.pfad), 3600);
    for (const e of s ?? []) if (e.path && e.signedUrl) urls.set(e.path, e.signedUrl);
  }
  return NextResponse.json({ bilder: zeilen.map((z) => ({ id: z.id, kategorie: z.kategorie, dateiname: z.dateiname, created_at: z.created_at, url: urls.get(z.pfad) ?? null })) });
}

export async function DELETE(req: NextRequest) {
  const k = await eigenerKunde();
  if (k instanceof NextResponse) return k;
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id fehlt' }, { status: 400 });
  const svc = createAdminClient();
  const { data } = await svc.from('kunden_bilder').select('pfad').eq('id', id).eq('agency_id', k.agencyId).maybeSingle();
  const pfad = (data as { pfad: string } | null)?.pfad;
  if (!pfad) return NextResponse.json({ error: 'Nicht gefunden' }, { status: 404 });
  await svc.storage.from(BILDER_BUCKET).remove([pfad]);
  await svc.from('kunden_bilder').delete().eq('id', id).eq('agency_id', k.agencyId);
  return NextResponse.json({ ok: true });
}
