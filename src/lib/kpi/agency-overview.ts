/**
 * Agentur-Übersicht: computeAmpel + getAgencyOverview (Phase 6 Task 7).
 *
 * Admin-Kontext: Iteration über ALLE Agenturen ist hier zulässig.
 * Jede Sub-Query wird mit .eq('agency_id', id) auf die jeweilige Agentur beschränkt.
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { shouldAlertErrorRate } from '@/lib/monitoring/ingest-monitor';

// ---------------------------------------------------------------------------
// Interfaces (buchstabengetreu lt. Task-7-Brief)
// ---------------------------------------------------------------------------

export type Ampel = 'gruen' | 'gelb' | 'rot';

export interface AgencyAlarm {
  type: 'wa_disconnected' | 'template_rejected' | 'ingest_errors' | 'job_no_apps' | 'dead_jobs';
  label: string;
}

export interface AgencyOverviewRow {
  agencyId: string;
  name: string;
  activeJobs: number;
  apps7: number;
  apps30: number;
  antwortquote30: number | null;
  qualifizierungsquote30: number | null;
  termine30: number;
  letzteAktivitaet: string | null;
  ampel: Ampel;
  whatsapp: {
    status: string | null;
    qualityRating: string | null;
    messagingLimit: string | null;
    rejectedTemplates: number;
  };
  alarms: AgencyAlarm[];
  usageMonth: {
    messagesOut: number;
    templatesByCategory: Record<string, number>;
    metaCostEur: number;
    aiInputTokens: number;
    aiOutputTokens: number;
    aiCostUsd: number;
  };
}

// ---------------------------------------------------------------------------
// computeAmpel — pure Funktion, vollständig testbar
// ---------------------------------------------------------------------------

/**
 * Berechnet die Ampelfarbe einer Agentur.
 *
 * Rot-Bedingungen (höchste Priorität):
 *   – WhatsApp-Status ist 'disconnected' oder 'banned'
 *   – Es gibt aktive Jobs, aber 0 Bewerbungen in 7 Tagen
 *
 * Gelb-Bedingungen:
 *   – Mindestens ein abgelehntes Template
 *   – Antwortquote der letzten 30 Tage liegt unter 40 %
 *
 * Sonst: grün.
 */
export function computeAmpel(
  row: Pick<AgencyOverviewRow, 'activeJobs' | 'apps7' | 'antwortquote30'> & {
    waStatus: string | null;
    rejectedTemplates: number;
  },
): Ampel {
  // Rot-Prüfung
  if (row.waStatus === 'disconnected' || row.waStatus === 'banned') return 'rot';
  if (row.activeJobs > 0 && row.apps7 === 0) return 'rot';

  // Gelb-Prüfung
  if (row.rejectedTemplates > 0) return 'gelb';
  if (row.antwortquote30 !== null && row.antwortquote30 < 0.4) return 'gelb';

  return 'gruen';
}

// ---------------------------------------------------------------------------
// Hilfsfunktion: sichere Division
// ---------------------------------------------------------------------------

function ratio(zaehler: number, nenner: number): number | null {
  return nenner > 0 ? zaehler / nenner : null;
}

// ---------------------------------------------------------------------------
// getAgencyOverview — Hauptfunktion
// ---------------------------------------------------------------------------

/**
 * Lädt für alle Agenturen die KPI-Übersichtszeile inkl. Ampel, Alarmen und Verbrauch.
 *
 * @param svc        Supabase-Client (Admin/Service-Role)
 * @param monthStart Erster Tag des aktuellen Monats, z. B. '2026-09-01'
 */
export async function getAgencyOverview(
  svc: SupabaseClient,
  monthStart: string,
): Promise<AgencyOverviewRow[]> {
  // --- Datenbeschaffung: Agenturen + Meta-Preise einmalig global laden ---
  const [{ data: agencies }, { data: pricingRows }] = await Promise.all([
    svc.from('agencies').select('id, name'),
    svc.from('meta_pricing').select('category, price_eur'),
  ]);

  // Preistabelle: category → price_eur
  const preisMap = new Map<string, number>();
  for (const p of pricingRows ?? []) {
    preisMap.set(p.category as string, p.price_eur as number);
  }

  const jetzt = new Date();
  const vor7Tagen  = new Date(jetzt.getTime() - 7  * 24 * 60 * 60 * 1000).toISOString();
  const vor30Tagen = new Date(jetzt.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const vor24h     = new Date(jetzt.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const ergebnisse: AgencyOverviewRow[] = [];

  for (const agency of agencies ?? []) {
    const id = agency.id as string;

    // -----------------------------------------------------------------------
    // Jobs
    // -----------------------------------------------------------------------
    const { data: jobsRaw } = await svc
      .from('jobs')
      .select('id, status')
      .eq('agency_id', id);

    const jobs = jobsRaw ?? [];
    const aktiveJobs = jobs.filter((j) => j.status === 'active');
    const aktiveJobIds = new Set(aktiveJobs.map((j) => j.id as string));

    // -----------------------------------------------------------------------
    // Bewerbungen (30 Tage)
    // -----------------------------------------------------------------------
    const { data: apps30Raw } = await svc
      .from('applications')
      .select('id, job_id, score_label, applied_at')
      .eq('agency_id', id)
      .gte('applied_at', vor30Tagen);

    const apps30 = apps30Raw ?? [];

    // Bewerbungen der letzten 7 Tage (aus apps30 herausfiltern)
    const apps7Count = apps30.filter(
      (a) => a.applied_at >= vor7Tagen,
    ).length;

    // -----------------------------------------------------------------------
    // Conversations + Messages (für Antwortquote)
    // -----------------------------------------------------------------------
    const app30Ids = apps30.map((a) => a.id as string);

    // Antwortquote: Apps mit ≥1 Inbound ÷ Apps mit ≥1 Outbound
    let appsWithInbound = 0;
    let appsWithOutbound = 0;
    let letzteAktivitaet: string | null = null;

    if (app30Ids.length > 0) {
      const { data: convsRaw } = await svc
        .from('conversations')
        .select('id, application_id, last_message_at')
        .eq('agency_id', id)
        .in('application_id', app30Ids);

      const convs = convsRaw ?? [];
      const convIds = convs.map((c) => c.id as string);

      // Letzte Aktivität: Maximum aus last_message_at und applied_at
      const alleZeiten: string[] = [
        ...apps30.map((a) => a.applied_at as string),
        ...convs.map((c) => c.last_message_at as string).filter(Boolean),
      ];
      letzteAktivitaet = alleZeiten.length > 0 ? alleZeiten.sort().at(-1) ?? null : null;

      if (convIds.length > 0) {
        const { data: msgsRaw } = await svc
          .from('messages')
          .select('conversation_id, direction, created_at')
          .eq('agency_id', id)
          .in('conversation_id', convIds);

        const msgs = msgsRaw ?? [];

        // Mapping conversation_id → application_id
        const convToApp = new Map<string, string>();
        for (const c of convs) {
          convToApp.set(c.id as string, c.application_id as string);
        }

        const appsWithOut = new Set<string>();
        const appsWithIn  = new Set<string>();

        for (const msg of msgs) {
          const appId = convToApp.get(msg.conversation_id as string);
          if (!appId) continue;
          if (msg.direction === 'out') appsWithOut.add(appId);
          if (msg.direction === 'in')  appsWithIn.add(appId);
        }

        appsWithOutbound = appsWithOut.size;
        appsWithInbound  = appsWithIn.size;
      }
    } else {
      // Keine Apps → letzte Aktivität aus apps30-Zeitstempeln (leer)
      letzteAktivitaet = null;
    }

    const antwortquote30 = ratio(appsWithInbound, appsWithOutbound);

    // -----------------------------------------------------------------------
    // Qualifizierungsquote (A/B ÷ score_label gesetzt)
    // -----------------------------------------------------------------------
    const mitScoreLabel = apps30.filter((a) => a.score_label !== null).length;
    const qualifiziert  = apps30.filter(
      (a) => a.score_label === 'A' || a.score_label === 'B',
    ).length;
    const qualifizierungsquote30 = ratio(qualifiziert, mitScoreLabel);

    // -----------------------------------------------------------------------
    // Termine (30 Tage)
    // -----------------------------------------------------------------------
    const { data: termineRaw } = await svc
      .from('appointments')
      .select('application_id, status')
      .eq('agency_id', id)
      .gte('created_at', vor30Tagen);

    const GEBUCHTE_STATUS = new Set(['booked', 'confirmed', 'done', 'no_show']);
    const termine30 = new Set(
      (termineRaw ?? [])
        .filter((t) => GEBUCHTE_STATUS.has(t.status as string))
        .map((t) => t.application_id as string),
    ).size;

    // -----------------------------------------------------------------------
    // WhatsApp-Account
    // -----------------------------------------------------------------------
    const { data: waAccount } = await svc
      .from('whatsapp_accounts')
      .select('status, quality_rating, messaging_limit')
      .eq('agency_id', id)
      .maybeSingle();

    // Anzahl abgelehnter / pausierter Templates
    const { data: rejectedTemplatesRaw } = await svc
      .from('whatsapp_templates')
      .select('id')
      .eq('agency_id', id)
      .in('status', ['rejected', 'paused']);

    const rejectedTemplatesCount = (rejectedTemplatesRaw ?? []).length;

    // -----------------------------------------------------------------------
    // Ingest-Events (24 h) — Fehlerquote
    // -----------------------------------------------------------------------
    const { data: ingestAllRaw } = await svc
      .from('events_inbox')
      .select('status')
      .eq('agency_id', id)
      .in('source', ['indeed', 'meta', 'generic'])
      .gte('received_at', vor24h);

    const ingestAll    = ingestAllRaw ?? [];
    const ingestTotal  = ingestAll.length;
    const ingestFailed = ingestAll.filter(
      (e) => e.status === 'failed' || e.status === 'dead',
    ).length;

    // -----------------------------------------------------------------------
    // Scheduled Jobs mit status='dead'
    // -----------------------------------------------------------------------
    const { data: deadJobsRaw } = await svc
      .from('scheduled_jobs')
      .select('id')
      .eq('agency_id', id)
      .eq('status', 'dead');

    const deadJobsCount = (deadJobsRaw ?? []).length;

    // -----------------------------------------------------------------------
    // Verbrauch (usage_daily dieses Monats)
    // -----------------------------------------------------------------------
    const { data: usageRaw } = await svc
      .from('usage_daily')
      .select(
        'messages_out, messages_in, templates_by_category, ai_input_tokens, ai_output_tokens, ai_cost_usd',
      )
      .eq('agency_id', id)
      .gte('day', monthStart);

    const usage = usageRaw ?? [];

    let messagesOut        = 0;
    let templatesByCategory: Record<string, number> = {};
    let aiInputTokens      = 0;
    let aiOutputTokens     = 0;
    let aiCostUsd          = 0;

    for (const u of usage) {
      messagesOut    += (u.messages_out  as number) ?? 0;
      aiInputTokens  += (u.ai_input_tokens  as number) ?? 0;
      aiOutputTokens += (u.ai_output_tokens as number) ?? 0;
      aiCostUsd      += (u.ai_cost_usd      as number) ?? 0;

      const cats = (u.templates_by_category as Record<string, number>) ?? {};
      for (const [cat, cnt] of Object.entries(cats)) {
        templatesByCategory[cat] = (templatesByCategory[cat] ?? 0) + (cnt as number);
      }
    }

    // metaCostEur = Σ templates_by_category[cat] × preis
    let metaCostEur = 0;
    for (const [cat, cnt] of Object.entries(templatesByCategory)) {
      const preis = preisMap.get(cat) ?? 0;
      metaCostEur += cnt * preis;
    }

    // -----------------------------------------------------------------------
    // Alarme berechnen (P6-R3)
    // -----------------------------------------------------------------------
    const alarms: AgencyAlarm[] = [];

    // wa_disconnected: Status ≠ connected bei vorhandenem Account
    if (waAccount && waAccount.status !== 'connected') {
      alarms.push({ type: 'wa_disconnected', label: 'WhatsApp-Nummer getrennt' });
    }

    // template_rejected: ≥1 Template rejected/paused
    if (rejectedTemplatesCount > 0) {
      alarms.push({
        type: 'template_rejected',
        label: `${rejectedTemplatesCount} Template(s) abgelehnt oder pausiert`,
      });
    }

    // ingest_errors: shouldAlertErrorRate über events_inbox der letzten 24 h
    if (shouldAlertErrorRate(ingestFailed, ingestTotal)) {
      alarms.push({
        type: 'ingest_errors',
        label: `Hohe Fehlerquote im Eingang (${ingestFailed}/${ingestTotal})`,
      });
    }

    // job_no_apps: ≥1 aktiver Job ohne Bewerbung in 7 Tagen
    const apps7Ids = new Set(
      apps30
        .filter((a) => (a.applied_at as string) >= vor7Tagen)
        .map((a) => a.job_id as string),
    );
    const jobOhneApps7 = aktiveJobs.filter((j) => !apps7Ids.has(j.id as string));
    if (jobOhneApps7.length > 0) {
      alarms.push({
        type: 'job_no_apps',
        label: `${jobOhneApps7.length} Job(s) ohne Bewerbung in 7 Tagen`,
      });
    }

    // dead_jobs: ≥1 scheduled_job mit status='dead'
    if (deadJobsCount > 0) {
      alarms.push({
        type: 'dead_jobs',
        label: `${deadJobsCount} fehlgeschlagene(r) Automatisierungsauftrag/-aufträge`,
      });
    }

    // -----------------------------------------------------------------------
    // Ampel
    // -----------------------------------------------------------------------
    const waStatus = waAccount?.status ?? null;
    const ampel = computeAmpel({
      waStatus,
      rejectedTemplates: rejectedTemplatesCount,
      activeJobs: aktiveJobs.length,
      apps7: apps7Count,
      antwortquote30,
    });

    // -----------------------------------------------------------------------
    // Ergebnis zusammenstellen
    // -----------------------------------------------------------------------
    ergebnisse.push({
      agencyId: id,
      name: agency.name as string,
      activeJobs: aktiveJobs.length,
      apps7: apps7Count,
      apps30: apps30.length,
      antwortquote30,
      qualifizierungsquote30,
      termine30,
      letzteAktivitaet,
      ampel,
      whatsapp: {
        status:          waAccount?.status          ?? null,
        qualityRating:   waAccount?.quality_rating  ?? null,
        messagingLimit:  waAccount?.messaging_limit ?? null,
        rejectedTemplates: rejectedTemplatesCount,
      },
      alarms,
      usageMonth: {
        messagesOut,
        templatesByCategory,
        metaCostEur,
        aiInputTokens,
        aiOutputTokens,
        aiCostUsd,
      },
    });
  }

  return ergebnisse;
}
