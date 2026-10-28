import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfOnboardingSchreiben } from '@/lib/onboarding/body';
import { DOKUMENTE_BUCKET, anzeigeName, handelsregisterPfad, istEigenerPfad, pruefeDatei } from '@/lib/onboarding/handelsregister';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Handelsregisterauszug im Onboarding (privat, Bucket kunden-dokumente).
 * POST {mime, groesse}      → signierter Upload-Link für den eigenen Kunden
 * PUT  {pfad, dateiname}    → hochgeladene Datei eintragen (alte wird gelöscht)
 * DELETE                    → Datei entfernen
 * GET  ?agencyId=           → Stand + Ansichts-Link (10 Min.); fremde Kunden nur für das interne Team
 */

type Eintrag = { id: string; handelsregister_pfad: string | null; handelsregister_dateiname: string | null; handelsregister_am: string | null };

async function eigenerKunde(): Promise<{ agencyId: string; userId: string } | NextResponse> {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  if (!user.agency_id) return NextResponse.json({ error: 'Kein Kunde zugeordnet' }, { status: 400 });
  if (!darfOnboardingSchreiben(user.role)) return NextResponse.json({ error: 'Nicht berechtigt' }, { status: 403 });
  return { agencyId: user.agency_id, userId: user.id };
}

async function letzterEintrag(svc: SupabaseClient, agencyId: string): Promise<Eintrag | null> {
  const { data } = await svc
    .from('onboarding_submissions')
    .select('id, handelsregister_pfad, handelsregister_dateiname, handelsregister_am')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as Eintrag | null) ?? null;
}

export async function POST(req: NextRequest) {
  const k = await eigenerKunde();
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => ({}))) as { mime?: unknown; groesse?: unknown };
  const fehler = pruefeDatei(body.mime, body.groesse);
  if (fehler) return NextResponse.json({ error: fehler }, { status: 400 });

  const pfad = handelsregisterPfad(k.agencyId, body.mime as string);
  const { data, error } = await createAdminClient().storage.from(DOKUMENTE_BUCKET).createSignedUploadUrl(pfad);
  if (error || !data) return NextResponse.json({ error: 'Upload gerade nicht möglich' }, { status: 500 });
  return NextResponse.json({ pfad, token: data.token, bucket: DOKUMENTE_BUCKET });
}

export async function PUT(req: NextRequest) {
  const k = await eigenerKunde();
  if (k instanceof NextResponse) return k;
  const body = (await req.json().catch(() => ({}))) as { pfad?: unknown; dateiname?: unknown };
  if (!istEigenerPfad(body.pfad, k.agencyId)) return NextResponse.json({ error: 'Ungültige Datei' }, { status: 400 });

  const svc = createAdminClient();
  const [ordner, datei] = [body.pfad.split('/')[0], body.pfad.split('/')[1]];
  const { data: liste } = await svc.storage.from(DOKUMENTE_BUCKET).list(ordner, { search: datei, limit: 1 });
  if (!liste?.some((o) => o.name === datei)) return NextResponse.json({ error: 'Datei nicht gefunden – bitte erneut hochladen' }, { status: 400 });

  const werte = { handelsregister_pfad: body.pfad, handelsregister_dateiname: anzeigeName(body.dateiname), handelsregister_am: new Date().toISOString() };
  const alt = await letzterEintrag(svc, k.agencyId);
  if (alt) {
    const { error } = await svc.from('onboarding_submissions').update({ ...werte, updated_at: new Date().toISOString() }).eq('id', alt.id).eq('agency_id', k.agencyId);
    if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
    if (alt.handelsregister_pfad && alt.handelsregister_pfad !== body.pfad && istEigenerPfad(alt.handelsregister_pfad, k.agencyId)) await svc.storage.from(DOKUMENTE_BUCKET).remove([alt.handelsregister_pfad]);
  } else {
    const { error } = await svc.from('onboarding_submissions').insert({ ...werte, agency_id: k.agencyId, status: 'in_progress' });
    if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  }
  return NextResponse.json({ dateiname: werte.handelsregister_dateiname, am: werte.handelsregister_am });
}

export async function DELETE() {
  const k = await eigenerKunde();
  if (k instanceof NextResponse) return k;
  const svc = createAdminClient();
  const alt = await letzterEintrag(svc, k.agencyId);
  if (alt?.handelsregister_pfad) {
    // Nur Dateien im eigenen Ordner löschen (der Pfad steht in der Tabelle und ist nicht vertrauenswürdig)
    if (istEigenerPfad(alt.handelsregister_pfad, k.agencyId)) await svc.storage.from(DOKUMENTE_BUCKET).remove([alt.handelsregister_pfad]);
    await svc.from('onboarding_submissions').update({ handelsregister_pfad: null, handelsregister_dateiname: null, handelsregister_am: null }).eq('id', alt.id).eq('agency_id', k.agencyId);
  }
  return NextResponse.json({ ok: true });
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 });
  const gewuenscht = req.nextUrl.searchParams.get('agencyId');
  const agencyId = gewuenscht && isInternal(user.role) ? gewuenscht : user.agency_id;
  if (!agencyId) return NextResponse.json({ error: 'Kein Kunde zugeordnet' }, { status: 400 });

  const svc = createAdminClient();
  const { data } = await svc
    .from('onboarding_submissions')
    .select('handelsregister_pfad, handelsregister_dateiname, handelsregister_am, firmen_strasse, firmen_plz, firmen_ort, company_name')
    .eq('agency_id', agencyId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const e = data as (Omit<Eintrag, 'id'> & { firmen_strasse: string | null; firmen_plz: string | null; firmen_ort: string | null; company_name: string | null }) | null;
  let url: string | null = null;
  // Nur Dateien im Ordner dieses Kunden signieren – sonst ließe sich über einen eingetragenen fremden Pfad ein fremdes Dokument abrufen
  if (e?.handelsregister_pfad && istEigenerPfad(e.handelsregister_pfad, agencyId)) {
    const { data: s } = await svc.storage.from(DOKUMENTE_BUCKET).createSignedUrl(e.handelsregister_pfad, 600);
    url = s?.signedUrl ?? null;
  }
  return NextResponse.json({
    dateiname: e?.handelsregister_dateiname ?? null,
    am: e?.handelsregister_am ?? null,
    url,
    firma: e?.company_name ?? null,
    strasse: e?.firmen_strasse ?? null,
    plz: e?.firmen_plz ?? null,
    ort: e?.firmen_ort ?? null,
  });
}
