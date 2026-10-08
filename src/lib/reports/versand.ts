import type { SupabaseClient } from '@supabase/supabase-js';
import { sendReportEmail } from '@/lib/email/resend';
import { logActivity } from '@/lib/activity/log';

export type ReportTyp = 'tag_7' | 'tag_14';

type Senden = typeof sendReportEmail;

/**
 * Tag-7/14-Report an den Kunden schicken und als versendet markieren.
 * Genutzt vom Knopf im Admin-Bereich und vom täglichen Cron direkt nach der Erzeugung.
 */
export async function versendeReport(
  svc: SupabaseClient,
  report: { id: string; agency_id: string; typ: ReportTyp; daten_json: Record<string, unknown> },
  opts: { userId?: string | null; senden?: Senden } = {},
): Promise<{ ok: true; email: string } | { ok: false; error: string }> {
  const { data: agency } = await svc.from('agencies').select('name, email').eq('id', report.agency_id).maybeSingle();
  const a = agency as { name: string; email: string | null } | null;
  if (!a?.email) return { ok: false, error: 'Keine E-Mail-Adresse fuer diese Agentur hinterlegt' };

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cloud.zoeppmedia.de';
  try {
    const res = (await (opts.senden ?? sendReportEmail)(a.email, report.typ, report.daten_json, a.name, `${baseUrl}/reports`)) as { error?: unknown } | null;
    if (res && typeof res === 'object' && 'error' in res && res.error) throw res.error;
  } catch {
    return { ok: false, error: 'E-Mail konnte nicht versendet werden' };
  }

  const { error } = await svc
    .from('reports')
    .update({ status: 'versendet', versendet_am: new Date().toISOString() })
    .eq('id', report.id);
  if (error) return { ok: false, error: 'Status-Update fehlgeschlagen' };

  await logActivity(svc, {
    agency_id: report.agency_id,
    user_id: opts.userId ?? null,
    action: `${report.typ === 'tag_7' ? 'Tag-7' : 'Tag-14'} Report an ${a.email} versendet`,
    action_type: 'report_sent',
    metadata: { report_id: report.id, typ: report.typ, email: a.email, automatisch: !opts.userId },
  });
  return { ok: true, email: a.email };
}
