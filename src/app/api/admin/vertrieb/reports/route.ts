import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { darfSalesControlling } from '@/lib/sales-controlling/zugriff';
import { ZEITRÄUME, zeitraumFür, type Zeitraum } from '@/lib/sales-controlling/laden';
import { ladeFreigaben } from '@/lib/freigaben';
import { SALES_WA_ACCOUNT_ID } from '@/lib/sales/calendly-chain';
import { REPORT_BUCKET, REPORT_VORLAGE, REPORTS_KEY, ladeReports, reportSchluessel, reportZahlen, type ReportZeile } from '@/lib/sales/report';

/**
 * Report-Funnel im Sales-Controlling.
 * GET ?zeitraum=                 → Zahlen, letzte Downloads, hinterlegte PDFs, Stand Freigaben/Vorlage
 * POST {funnel}                  → signierter Upload-Link fürs PDF (nur Admins)
 * PUT  {funnel, titel, pfad?}    → PDF/Titel zum Report speichern (nur Admins)
 */
export async function GET(req: NextRequest) {
  if (!(await darfSalesControlling())) return NextResponse.json({ error: 'Kein Zugriff' }, { status: 403 });
  const g = req.nextUrl.searchParams.get('zeitraum') ?? '';
  const z: Zeitraum = (ZEITRÄUME as readonly string[]).includes(g) ? (g as Zeitraum) : 'monat';
  const { von, bis } = zeitraumFür(z, new Date());
  const svc = createAdminClient();
  const [{ data }, reports, freigaben, { data: vorlage }] = await Promise.all([
    svc
      .from('sales_report_downloads')
      .select('id, lead_id, report, name, eingetragen_am, whatsapp_am, whatsapp_status, geoeffnet_am, erster_anruf_am, gebucht_am, ergebnis')
      .gte('eingetragen_am', von)
      .lt('eingetragen_am', bis)
      .order('eingetragen_am', { ascending: false }),
    ladeReports(svc),
    ladeFreigaben(svc),
    svc.from('whatsapp_templates').select('status').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('preset_key', REPORT_VORLAGE).maybeSingle(),
  ]);
  const rows = (data ?? []) as Array<ReportZeile & { id: string; lead_id: string; name: string | null; whatsapp_status: string | null }>;
  return NextResponse.json({
    zahlen: reportZahlen(rows),
    letzte: rows.slice(0, 20),
    reports: Object.entries(reports).map(([key, r]) => ({ key, titel: r.titel, pdf: !!r.pfad })),
    stand: {
      intern: freigaben.report_intern,
      whatsapp: freigaben.report_whatsapp,
      vorlage: (vorlage as { status: string } | null)?.status ?? 'nicht eingereicht',
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
  const b = (await req.json().catch(() => ({}))) as { funnel?: unknown };
  const key = reportSchluessel(typeof b.funnel === 'string' ? b.funnel : null);
  const pfad = `${key}/${Date.now()}.pdf`;
  const { data, error } = await createAdminClient().storage.from(REPORT_BUCKET).createSignedUploadUrl(pfad);
  if (error || !data) return NextResponse.json({ error: 'Upload gerade nicht möglich' }, { status: 500 });
  return NextResponse.json({ bucket: REPORT_BUCKET, pfad, token: data.token });
}

export async function PUT(req: NextRequest) {
  const verboten = await nurAdmin();
  if (verboten) return verboten;
  const b = (await req.json().catch(() => ({}))) as { funnel?: unknown; titel?: unknown; pfad?: unknown };
  const titel = typeof b.titel === 'string' ? b.titel.trim().slice(0, 80) : '';
  if (!titel) return NextResponse.json({ error: 'Titel fehlt' }, { status: 400 });
  const key = reportSchluessel(typeof b.funnel === 'string' ? b.funnel : null);
  const pfad = typeof b.pfad === 'string' && b.pfad.startsWith(`${key}/`) && b.pfad.endsWith('.pdf') ? b.pfad : undefined;

  const svc = createAdminClient();
  const reports = await ladeReports(svc);
  reports[key] = { titel, pfad: pfad ?? reports[key]?.pfad ?? null };
  const { error } = await svc.from('system_einstellungen').upsert({ key: REPORTS_KEY, wert: JSON.stringify(reports), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return NextResponse.json({ error: 'Speichern fehlgeschlagen' }, { status: 500 });
  return NextResponse.json({ ok: true, key });
}
