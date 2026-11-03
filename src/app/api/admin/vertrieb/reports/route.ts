import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfSalesControlling } from '@/lib/sales-controlling/zugriff';
import { ZEITRÄUME, zeitraumFür, type Zeitraum } from '@/lib/sales-controlling/laden';
import { ladeFreigaben } from '@/lib/freigaben';
import { SALES_WA_ACCOUNT_ID } from '@/lib/sales/calendly-chain';
import { REPORT_BUCKET, REPORT_VORLAGE, REPORT_VORLAGE_BILD, REPORTS_KEY, ladeReports, reportSchluessel, reportZahlen, type ReportZeile } from '@/lib/sales/report';

/**
 * Report-Funnel im Sales-Controlling.
 * GET ?zeitraum=                 → Zahlen, letzte Downloads, hinterlegte PDFs, Stand Freigaben/Vorlage
 * POST {funnel, art?, typ?}      → signierter Upload-Link fürs PDF bzw. Cover-Bild (art 'bild') (nur Admins)
 * PUT  {funnel, titel, pfad?, bild?} → PDF/Bild/Titel speichern; neues Bild reicht die Bild-Vorlage bei Meta ein (nur Admins)
 */
export async function GET(req: NextRequest) {
  if (!(await darfSalesControlling())) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const g = req.nextUrl.searchParams.get('zeitraum') ?? '';
  const z: Zeitraum = (ZEITRÄUME as readonly string[]).includes(g) ? (g as Zeitraum) : 'monat';
  const { von, bis } = zeitraumFür(z, new Date());
  const svc = createAdminClient();
  // Bild-Vorlage wartet auf Meta → Status beim Öffnen nachziehen (sonst erst im täglichen Abgleich)
  const { data: bildAlt } = await svc.from('whatsapp_templates').select('status').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('preset_key', REPORT_VORLAGE_BILD).maybeSingle();
  if ((bildAlt as { status: string } | null)?.status === 'pending') {
    await import('@/lib/sales/vorlagen').then(({ aktualisiereSalesVorlagen }) => aktualisiereSalesVorlagen(svc)).catch((e) => console.error('[reports] Vorlagen-Status:', e));
  }
  const [{ data }, reports, freigaben, { data: vorlage }, { data: vorlageBild }] = await Promise.all([
    svc
      .from('sales_report_downloads')
      .select('id, lead_id, report, name, eingetragen_am, whatsapp_am, whatsapp_status, geoeffnet_am, erster_anruf_am, gebucht_am, ergebnis')
      .gte('eingetragen_am', von)
      .lt('eingetragen_am', bis)
      .order('eingetragen_am', { ascending: false }),
    ladeReports(svc),
    ladeFreigaben(svc),
    svc.from('whatsapp_templates').select('status').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('preset_key', REPORT_VORLAGE).maybeSingle(),
    svc.from('whatsapp_templates').select('status').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('preset_key', REPORT_VORLAGE_BILD).maybeSingle(),
  ]);
  const rows = (data ?? []) as Array<ReportZeile & { id: string; lead_id: string; name: string | null; whatsapp_status: string | null }>;
  return NextResponse.json({
    zahlen: reportZahlen(rows),
    letzte: rows.slice(0, 20),
    reports: Object.entries(reports).map(([key, r]) => ({ key, titel: r.titel, pdf: !!r.pfad, bild: !!r.bild })),
    stand: {
      intern: freigaben.report_intern,
      whatsapp: freigaben.report_whatsapp,
      vorlage: (vorlage as { status: string } | null)?.status ?? 'nicht eingereicht',
      vorlageBild: (vorlageBild as { status: string } | null)?.status ?? 'nicht eingereicht',
    },
  });
}

async function nurAdmin(): Promise<NextResponse | null> {
  const user = await getCurrentUser();
  return user?.role === 'admin' ? null : NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const verboten = await nurAdmin();
  if (verboten) return verboten;
  const b = (await req.json().catch(() => ({}))) as { funnel?: unknown; art?: unknown; typ?: unknown };
  const key = reportSchluessel(typeof b.funnel === 'string' ? b.funnel : null);
  const pfad = b.art === 'bild' ? `${key}/bild-${Date.now()}.${b.typ === 'image/png' ? 'png' : 'jpg'}` : `${key}/${Date.now()}.pdf`;
  const { data, error } = await createAdminClient().storage.from(REPORT_BUCKET).createSignedUploadUrl(pfad);
  if (error || !data) return NextResponse.json({ error: 'Upload gerade nicht möglich' }, { status: 500 });
  return NextResponse.json({ bucket: REPORT_BUCKET, pfad, token: data.token });
}

export async function PUT(req: NextRequest) {
  const verboten = await nurAdmin();
  if (verboten) return verboten;
  const b = (await req.json().catch(() => ({}))) as { funnel?: unknown; titel?: unknown; pfad?: unknown; bild?: unknown };
  const titel = typeof b.titel === 'string' ? b.titel.trim().slice(0, 80) : '';
  if (!titel) return NextResponse.json({ error: 'Titel fehlt' }, { status: 400 });
  const key = reportSchluessel(typeof b.funnel === 'string' ? b.funnel : null);
  const pfad = typeof b.pfad === 'string' && b.pfad.startsWith(`${key}/`) && b.pfad.endsWith('.pdf') ? b.pfad : undefined;
  const bild = typeof b.bild === 'string' && b.bild.startsWith(`${key}/bild-`) && /\.(jpg|png)$/.test(b.bild) ? b.bild : undefined;

  const svc = createAdminClient();
  const reports = await ladeReports(svc);
  const alt = reports[key];
  reports[key] = { titel, pfad: pfad ?? alt?.pfad ?? null, bild: bild ?? alt?.bild ?? null };
  const { error } = await svc.from('system_einstellungen').upsert({ key: REPORTS_KEY, wert: JSON.stringify(reports), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });

  // Alte Dateien aufräumen (nur ersetzte, nie die aktuelle)
  const weg = [pfad && alt?.pfad !== pfad ? alt?.pfad : null, bild && alt?.bild !== bild ? alt?.bild : null].filter((x): x is string => !!x);
  if (weg.length) await svc.storage.from(REPORT_BUCKET).remove(weg).catch(() => null);

  // Bild hinterlegt → Bild-Vorlage bei Meta einreichen, solange sie noch nicht freigegeben/eingereicht ist (Meta braucht ein Beispielbild).
  // Auch beim erneuten Speichern ohne neues Bild, damit eine gescheiterte Einreichung nachgeholt werden kann.
  let vorlageBild: { status: string; fehler?: string } | null = null;
  const bildAktuell = reports[key].bild;
  if (bildAktuell) {
    const { data: t } = await svc.from('whatsapp_templates').select('status').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('preset_key', REPORT_VORLAGE_BILD).maybeSingle();
    const st = (t as { status: string } | null)?.status;
    if (st === 'approved' || st === 'pending') vorlageBild = { status: st };
    else {
      const { data: datei } = await svc.storage.from(REPORT_BUCKET).download(bildAktuell);
      if (!datei) vorlageBild = { status: 'fehler', fehler: 'Bild nicht lesbar' };
      else {
        const { reicheSalesVorlageEin } = await import('@/lib/sales/vorlagen');
        vorlageBild = await reicheSalesVorlageEin(svc, REPORT_VORLAGE_BILD, { bild: { bytes: await datei.arrayBuffer(), typ: bildAktuell.endsWith('.png') ? 'image/png' : 'image/jpeg' } });
        if (vorlageBild.status === 'fehler') console.error('[reports] Bild-Vorlage nicht eingereicht:', vorlageBild.fehler);
      }
    }
  }
  return NextResponse.json({ ok: true, key, vorlageBild });
}
