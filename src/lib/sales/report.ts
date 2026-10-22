/**
 * Report-Funnel (Freebie über Perspective) – eigene Strecke neben den normalen Funnel-Eintragungen:
 *   1) Eintragung (Webhook sales-funnel, Funnel-Name enthält „Report“) → Close-Lead mit Leadquelle „Report – <Name>“
 *   2) Sofort: Slack #03-sales mit Erwähnung von Felix („jetzt anrufen“)            – Freigabe report_intern
 *   3) Sofort: WhatsApp report_versand mit PDF-Link + „Erstgespräch buchen“          – Freigabe report_whatsapp (aus: nur Testnummern)
 *   4) Nach 10 Min. ohne Termin: Close-Aufgabe „Report runtergeladen – jetzt anrufen“ – Freigabe report_intern
 * Keine Eintrag-Kette, kein Speed-Alarm, nicht in den Eintragungs-Zahlen – eigene Zahlen (Anruf-Tempo, Buchungen) in sales_report_downloads.
 * Smart View „📄 3.4 Report runtergeladen – kein Termin“ (close.einrichtung smartview_report).
 * PDFs: Bucket sales-reports, Zuordnung Funnel → PDF in system_einstellungen.sales_reports.
 */

import { createHmac, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { logActivity } from '@/lib/activity/log';
import { istFreigegeben } from '@/lib/freigaben';
import { sendWhatsAppMessage } from '@/lib/whatsapp/send';
import { ensureSalesProspect, normalizeToE164, SALES_AGENCY_ID, SALES_WA_ACCOUNT_ID } from './calendly-chain';
import { addCloseTaskForLead } from './close';
import { findeBuchung } from './eintragungen';
import { notifySales } from './notify';
import { buildClickToken } from './tracking';

export const REPORT_BUCKET = 'sales-reports';
export const REPORTS_KEY = 'sales_reports';
export const REPORT_VORLAGE = 'report_versand';
export const REPORT_WARTEZEIT_MIN = 10;
/** Felix in Slack (wird bei jedem Download erwähnt) */
export const FELIX_SLACK_ID = 'U09EK5NAR4P';
const MIN = 60_000;

/* ── Erkennen + Leadquelle (rein, testbar) ─────────────────────── */

/** Kommt die Eintragung aus einem Report-Funnel? (Funnel-Name aus Perspective oder ?funnel=) */
export function istReportFunnel(funnelName: string | null | undefined): boolean {
  return /report/i.test(funnelName ?? '');
}

/** Leadquelle eines Report-Leads */
export function istReportQuelle(quelle: string | null | undefined): boolean {
  return /^report\b/i.test((quelle ?? '').trim());
}

/** „Report-300k“ → „Report – 300k“, „Vertriebs-Report“ → „Report – Vertriebs-Report“ */
export function reportQuelle(funnelName: string | null | undefined): string {
  const rest = (funnelName ?? '').replace(/^\s*report[\s_\-–:]*/i, '').trim();
  return rest ? `Report – ${rest}` : 'Report';
}

/** Schlüssel für die PDF-Zuordnung: „Report – 300k“ / „Report-300k“ → „300k“ */
export function reportSchluessel(name: string | null | undefined): string {
  const rest = (name ?? '').replace(/^\s*report[\s_\-–:]*/i, '').trim();
  return (rest || 'standard').toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'standard';
}

/* ── PDFs ──────────────────────────────────────────────────────── */

export interface ReportPdf {
  titel: string;
  pfad: string | null;
}

export async function ladeReports(svc: SupabaseClient): Promise<Record<string, ReportPdf>> {
  const { data } = await svc.from('system_einstellungen').select('wert').eq('key', REPORTS_KEY).maybeSingle();
  try {
    const w = (data as { wert: unknown } | null)?.wert;
    return ((typeof w === 'string' ? JSON.parse(w) : w) as Record<string, ReportPdf> | null) ?? {};
  } catch {
    return {};
  }
}

/** PDF zum Report: passender Schlüssel, sonst der einzige hinterlegte Report (rein, testbar) */
export function waehleReport(reports: Record<string, ReportPdf>, report: string): ReportPdf | null {
  const treffer = reports[reportSchluessel(report)];
  if (treffer) return treffer;
  const alle = Object.values(reports).filter((r) => r.pfad);
  return alle.length === 1 ? alle[0] : null;
}

/* ── Öffnen-Link (signiert, je Download) ───────────────────────── */

function signatur(id: string): string | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return null;
  return createHmac('sha256', secret).update(`sales-report:${id}`).digest('base64url').slice(0, 16);
}

export function reportToken(downloadId: string): string {
  const sig = signatur(downloadId);
  if (!sig) throw new Error('CRON_SECRET fehlt – Report-Link kann nicht signiert werden');
  return `${downloadId}.${sig}`;
}

export function leseReportToken(token: string): string | null {
  const [id, sig] = token.split('.');
  if (!id || !sig || !/^[0-9a-f-]{36}$/.test(id)) return null;
  const erwartet = signatur(id);
  if (!erwartet || erwartet.length !== sig.length) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(erwartet)) ? id : null;
}

/* ── Start (aus dem Funnel-Webhook) ────────────────────────────── */

interface Download {
  id: string;
  lead_id: string;
  report: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  eingetragen_am: string;
  gebucht_am: string | null;
  geoeffnet_am: string | null;
  whatsapp_am: string | null;
  ergebnis: string;
}

function uhr(d: Date): string {
  return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}

/** Download erfassen, Felix in Slack taggen, WhatsApp + 10-Min-Check einplanen */
export async function starteReport(
  svc: SupabaseClient,
  d: { leadId: string; neu: boolean; report: string; name: string | null; email: string | null; phone: string | null },
  jetzt: Date = new Date(),
): Promise<string> {
  const { data, error } = await svc
    .from('sales_report_downloads')
    .insert({ lead_id: d.leadId, report: d.report, name: d.name, email: d.email, phone: d.phone, neuer_lead: d.neu, eingetragen_am: jetzt.toISOString() })
    .select('id')
    .single();
  if (error) throw new Error(`Report-Download nicht gespeichert: ${error.message}`);
  const id = (data as { id: string }).id;

  const jobs = [
    { type: 'sales.report_whatsapp', run_at: jetzt.toISOString() },
    { type: 'sales.report_check', run_at: new Date(jetzt.getTime() + REPORT_WARTEZEIT_MIN * MIN).toISOString() },
  ].map((j) => ({ ...j, agency_id: SALES_AGENCY_ID, payload: { download_id: id }, status: 'pending', dedupe_key: `${j.type}:${id}` }));
  const { error: jobErr } = await svc.from('scheduled_jobs').insert(jobs);
  if (jobErr && jobErr.code !== '23505') console.error('[report] Jobs nicht geplant:', jobErr.message);

  if (await istFreigegeben(svc, 'report_intern')) {
    await notifySales(svc, {
      emoji: '📄',
      title: `${d.name ?? 'Neuer Lead'} hat den ${d.report} runtergeladen – jetzt anrufen`,
      body: `Eingetragen um ${uhr(jetzt)} Uhr${d.neu ? '' : ' (schon in Close)'}. Je schneller der Anruf, desto höher die Chance auf das Erstgespräch.`,
      type: 'task_due',
      phone: d.phone,
      erwaehnen: FELIX_SLACK_ID,
      closeLeadId: d.leadId,
    });
    await svc.from('sales_report_downloads').update({ slack_am: new Date().toISOString() }).eq('id', id);
  }
  return id;
}

async function ladeDownload(svc: SupabaseClient, id: string): Promise<Download | null> {
  const { data } = await svc
    .from('sales_report_downloads')
    .select('id, lead_id, report, name, email, phone, eingetragen_am, gebucht_am, geoeffnet_am, whatsapp_am, ergebnis')
    .eq('id', id)
    .maybeSingle();
  return data as Download | null;
}

/* ── Job sales.report_whatsapp ─────────────────────────────────── */

/** Ohne Freigabe nur an Testnummern (Admin → Anbindung → Bewerber-Kontakt) */
async function darfReportSenden(svc: SupabaseClient, telefon: string): Promise<boolean> {
  if (await istFreigegeben(svc, 'report_whatsapp')) return true;
  const { ladeSchalter, darfKontakt } = await import('@/lib/recruiting/kontakt-schalter');
  const s = await ladeSchalter(svc);
  return darfKontakt({ ...s, aktiv: false, kunden: [] }, { telefon });
}

export async function sendeReportWhatsApp(svc: SupabaseClient, payload: { download_id: string }): Promise<string> {
  const d = await ladeDownload(svc, payload.download_id);
  if (!d) return 'unbekannt';
  if (d.whatsapp_am) return 'schon_gesendet';
  const status = async (s: string) => {
    await svc.from('sales_report_downloads').update({ whatsapp_status: s }).eq('id', d.id);
    return s;
  };

  const nummer = normalizeToE164(d.phone);
  if (!nummer) return status('keine_nummer');
  if (!(await darfReportSenden(svc, nummer))) return status('aus');

  const pdf = waehleReport(await ladeReports(svc), d.report);
  if (!pdf?.pfad) return status('kein_pdf');
  const { data: v } = await svc
    .from('whatsapp_templates')
    .select('id, name')
    .eq('wa_account_id', SALES_WA_ACCOUNT_ID)
    .eq('preset_key', REPORT_VORLAGE)
    .eq('status', 'approved')
    .maybeSingle();
  const tmpl = v as { id: string; name: string } | null;
  if (!tmpl) return status('vorlage_fehlt');

  // STOP respektieren
  const { data: vorhanden } = await svc.from('candidates').select('id, whatsapp_opt_in').eq('agency_id', SALES_AGENCY_ID).eq('phone_e164', nummer).is('deleted_at', null).limit(1).maybeSingle();
  const alt = vorhanden as { id: string; whatsapp_opt_in: boolean } | null;
  if (alt && !alt.whatsapp_opt_in) return status('abgemeldet');
  const prospectId = alt?.id ?? (await ensureSalesProspect(svc, nummer, d.name ?? 'Lead', d.email));
  if (!prospectId) return status('unbekannt');

  await svc.from('conversations').upsert(
    { agency_id: SALES_AGENCY_ID, candidate_id: prospectId, wa_account_id: SALES_WA_ACCOUNT_ID, state: 'human_active' },
    { onConflict: 'wa_account_id,candidate_id', ignoreDuplicates: true },
  );
  const { data: conv } = await svc.from('conversations').select('id').eq('wa_account_id', SALES_WA_ACCOUNT_ID).eq('candidate_id', prospectId).single();
  const conversationId = (conv as { id: string }).id;

  const vorname = (d.name ?? '').trim().split(/\s+/)[0] || 'zusammen';
  await sendWhatsAppMessage(svc, {
    agencyId: SALES_AGENCY_ID,
    conversationId,
    candidatePhone: nummer,
    waAccountId: SALES_WA_ACCOUNT_ID,
    payload: {
      to: nummer,
      type: 'template',
      template: {
        name: tmpl.name,
        language: { code: 'de' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: vorname }, { type: 'text', text: pdf.titel }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: reportToken(d.id) }] },
          { type: 'button', sub_type: 'url', index: '1', parameters: [{ type: 'text', text: buildClickToken(prospectId, 'setting', 'report') }] },
        ],
      },
    },
    senderType: 'system',
    // Der Lead hat den Report gerade selbst angefordert → sofort, auch abends
    bypassQuietHours: true,
    templateId: tmpl.id,
  });
  await svc.from('sales_report_downloads').update({ whatsapp_am: new Date().toISOString(), whatsapp_status: 'gesendet' }).eq('id', d.id);
  await logActivity(svc, {
    agency_id: SALES_AGENCY_ID,
    candidate_id: prospectId,
    action: `Report per WhatsApp gesendet (${pdf.titel})`,
    action_type: 'other',
    metadata: { kind: 'sales_report', lead_id: d.lead_id, download_id: d.id },
  }).catch(() => {});
  return 'gesendet';
}

/* ── Job sales.report_check (10 Min.) ──────────────────────────── */

export function reportErgebnis(eingetragen: Date, gebucht: Date | null): 'direkt_gebucht' | 'spaeter_gebucht' | 'nicht_gebucht' {
  if (!gebucht) return 'nicht_gebucht';
  return gebucht.getTime() - eingetragen.getTime() <= REPORT_WARTEZEIT_MIN * MIN ? 'direkt_gebucht' : 'spaeter_gebucht';
}

export async function pruefeReport(svc: SupabaseClient, payload: { download_id: string }, heute: string): Promise<string> {
  const d = await ladeDownload(svc, payload.download_id);
  if (!d) return 'unbekannt';
  const gebucht = d.gebucht_am ? new Date(d.gebucht_am) : await findeBuchung(svc, d);
  const ergebnis = reportErgebnis(new Date(d.eingetragen_am), gebucht);
  await svc.from('sales_report_downloads').update({ ergebnis, gebucht_am: gebucht?.toISOString() ?? null }).eq('id', d.id);
  if (ergebnis !== 'nicht_gebucht') return ergebnis;
  if (!(await istFreigegeben(svc, 'report_intern'))) return 'nicht_gebucht (Aufgabe aus)';

  const text = `📄 Report runtergeladen, kein Termin – jetzt anrufen: ${d.name ?? 'Lead'}${d.phone ? ` – ${d.phone}` : ''} (${d.report})`;
  await addCloseTaskForLead(d.lead_id, text, heute).catch((err) => console.error('[report] Aufgabe fehlgeschlagen:', err));
  await svc.from('sales_report_downloads').update({ aufgabe_am: new Date().toISOString() }).eq('id', d.id);
  await notifySales(svc, {
    emoji: '📞',
    title: `${d.name ?? 'Report-Lead'} – kein Termin nach ${REPORT_WARTEZEIT_MIN} Min.`,
    body: `${d.report} um ${uhr(new Date(d.eingetragen_am))} Uhr runtergeladen${d.geoeffnet_am ? ', PDF schon geöffnet' : ''}. Aufgabe „jetzt anrufen“ ist in Close.`,
    type: 'task_due',
    phone: d.phone,
    erwaehnen: FELIX_SLACK_ID,
    closeLeadId: d.lead_id,
  });
  return 'nicht_gebucht';
}

/* ── Tracking: Anruf, Buchung, Öffnen ──────────────────────────── */

const ziffern = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '').replace(/^00/, '').replace(/^49/, '').replace(/^0/, '');

/** Close-Webhook activity.call → erster Anruf nach dem Download */
export async function markiereReportAnruf(svc: SupabaseClient, leadId: string, zeit: Date = new Date()): Promise<void> {
  await svc
    .from('sales_report_downloads')
    .update({ erster_anruf_am: zeit.toISOString() })
    .eq('lead_id', leadId)
    .is('erster_anruf_am', null)
    .lte('eingetragen_am', zeit.toISOString());
}

/** Calendly-Buchung → offene Report-Downloads (30 Tage) über E-Mail/Telefon zuordnen */
export async function markiereReportBuchung(svc: SupabaseClient, b: { email: string | null; phone: string | null; gebuchtAm: Date }): Promise<void> {
  const seit = new Date(b.gebuchtAm.getTime() - 30 * 864e5).toISOString();
  const { data } = await svc
    .from('sales_report_downloads')
    .select('id, email, phone, eingetragen_am')
    .is('gebucht_am', null)
    .gte('eingetragen_am', seit)
    .lte('eingetragen_am', b.gebuchtAm.toISOString());
  const mail = b.email?.toLowerCase() ?? null;
  const tel = ziffern(b.phone);
  for (const r of (data ?? []) as Array<{ id: string; email: string | null; phone: string | null; eingetragen_am: string }>) {
    if (!((mail && r.email?.toLowerCase() === mail) || (tel.length >= 6 && ziffern(r.phone) === tel))) continue;
    await svc
      .from('sales_report_downloads')
      .update({ gebucht_am: b.gebuchtAm.toISOString(), ergebnis: reportErgebnis(new Date(r.eingetragen_am), b.gebuchtAm) })
      .eq('id', r.id);
  }
}

/* ── Zahlen fürs Sales-Controlling (rein, testbar) ─────────────── */

export interface ReportZeile {
  report: string;
  eingetragen_am: string;
  whatsapp_am: string | null;
  geoeffnet_am: string | null;
  erster_anruf_am: string | null;
  gebucht_am: string | null;
  ergebnis: string;
}

export interface ReportZahlen {
  downloads: number;
  whatsapp: number;
  geoeffnet: number;
  geoeffnetQuote: number | null;
  direkt: number;
  direktQuote: number | null;
  gebucht: number;
  gebuchtQuote: number | null;
  angerufen: number;
  /** Median Minuten vom Download bis zum ersten Anruf */
  medianMinBisAnruf: number | null;
  /** Anteil der Downloads, die innerhalb von 5 Minuten angerufen wurden */
  in5MinQuote: number | null;
  reports: Array<{ report: string; downloads: number; gebucht: number; gebuchtQuote: number | null }>;
}

export function reportZahlen(rows: ReportZeile[]): ReportZahlen {
  const n = rows.length;
  const pct = (a: number, b = n) => (b ? Math.round((a / b) * 100) : null);
  const minuten = rows
    .filter((r) => r.erster_anruf_am)
    .map((r) => (new Date(r.erster_anruf_am!).getTime() - new Date(r.eingetragen_am).getTime()) / MIN)
    .sort((a, b) => a - b);
  const gebucht = rows.filter((r) => r.gebucht_am).length;
  const geoeffnet = rows.filter((r) => r.geoeffnet_am).length;
  const whatsapp = rows.filter((r) => r.whatsapp_am).length;
  const direkt = rows.filter((r) => r.ergebnis === 'direkt_gebucht').length;
  const gruppen = new Map<string, ReportZeile[]>();
  for (const r of rows) gruppen.set(r.report, [...(gruppen.get(r.report) ?? []), r]);
  return {
    downloads: n,
    whatsapp,
    geoeffnet,
    geoeffnetQuote: pct(geoeffnet, whatsapp),
    direkt,
    direktQuote: pct(direkt),
    gebucht,
    gebuchtQuote: pct(gebucht),
    angerufen: minuten.length,
    medianMinBisAnruf: minuten.length ? Math.round(minuten[Math.floor(minuten.length / 2)]) : null,
    in5MinQuote: pct(minuten.filter((m) => m <= 5).length),
    reports: [...gruppen]
      .map(([report, rs]) => {
        const g = rs.filter((r) => r.gebucht_am).length;
        return { report, downloads: rs.length, gebucht: g, gebuchtQuote: pct(g, rs.length) };
      })
      .sort((a, b) => b.downloads - a.downloads),
  };
}
