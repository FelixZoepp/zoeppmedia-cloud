import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { isPreviewBot } from '@/lib/sales/tracking';
import { REPORT_BUCKET, ladeReports, leseReportToken, waehleReport } from '@/lib/sales/report';

/**
 * Button „Report öffnen“ aus der WhatsApp report_versand: Öffnen zählen (ohne Link-Vorschau-Bots),
 * dann zum PDF (signierter Link, 1 Tag gültig). Ungültiger Token → Startseite.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = leseReportToken(token);
  const fallback = 'https://zoeppmedia.de';
  if (!id) return NextResponse.redirect(fallback, 302);

  const svc = createAdminClient();
  const { data } = await svc.from('sales_report_downloads').select('id, report, geoeffnet_am').eq('id', id).maybeSingle();
  const d = data as { id: string; report: string; geoeffnet_am: string | null } | null;
  if (!d) return NextResponse.redirect(fallback, 302);

  const pdf = waehleReport(await ladeReports(svc), d.report);
  if (!pdf?.pfad) return NextResponse.redirect(fallback, 302);
  if (!d.geoeffnet_am && !isPreviewBot(request.headers.get('user-agent'))) {
    await svc.from('sales_report_downloads').update({ geoeffnet_am: new Date().toISOString() }).eq('id', d.id);
  }
  const { data: link } = await svc.storage.from(REPORT_BUCKET).createSignedUrl(pdf.pfad, 86400);
  return NextResponse.redirect(link?.signedUrl ?? fallback, 302);
}
