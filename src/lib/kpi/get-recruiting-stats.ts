/**
 * Fetch-Schicht für Recruiting-Statistiken (Phase 6 Task 4).
 * Lädt alle benötigten Daten aus Supabase und delegiert die Berechnung
 * an computeRecruitingKpis aus Task 3.
 *
 * MULTI-TENANT-DOKTRIN: service-role umgeht RLS → JEDE Query auf
 * agency-scoped Tabellen trägt explizites .eq('agency_id', agencyId).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll, fetchAllIn } from '@/lib/supabase/fetch-all';
import {
  computeRecruitingKpis,
  type KpiAppRow,
  type KpiInput,
  type KpiTiles,
  type RecruitingKpis,
} from '@/lib/kpi/recruiting-kpis';

// ---------------------------------------------------------------------------
// Öffentliche Interfaces
// ---------------------------------------------------------------------------

export interface StatsFilters {
  from: string;
  to: string;
  jobId?: string;
  source?: string;
}

export interface JobTableRow {
  jobId: string;
  title: string;
  status: string;
  bewerbungen: number;
  antwortquote: number | null;
  qualifiziert: number;
  termine: number;
  einstellungen: number;
}

export interface RecruitingStatsPayload {
  kpis: RecruitingKpis;
  previousTiles: KpiTiles;
  jobsTable: JobTableRow[];
  tasks: {
    brauchtMensch: number;
    qualifiziertOhneAktion: number;
    termineHeute: number;
  };
}

// ---------------------------------------------------------------------------
// Interne Typen (DB-Zeilen)
// ---------------------------------------------------------------------------

interface DbAppRow {
  id: string;
  job_id: string;
  source: string;
  score_label: string | null;
  score_reasons: unknown;
  status: string;
  stage_id: string | null;
  applied_at: string;
  assigned_to: string | null;
}

interface DbMessageRow {
  conversation_id: string;
  direction: string;
  sender_type: string;
  created_at: string;
}

interface DbConvRow {
  id: string;
  application_id: string;
  state: string;
}

interface DbAppointmentRow {
  application_id: string;
  status: string;
  starts_at: string;
  created_at: string;
}

interface DbPipelineStageRow {
  id: string;
  stage_type: string;
}

interface DbJobRow {
  id: string;
  title: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Extrahiert Knockout-Gründe tolerant aus score_reasons.
 * Unterstützt String-Array und Objekt-Array mit reason-Feld.
 */
function extractKnockoutReasons(scoreReasons: unknown): string[] {
  if (!Array.isArray(scoreReasons)) return [];
  const result: string[] = [];
  for (const item of scoreReasons) {
    if (typeof item === 'string') {
      result.push(item);
    } else if (item !== null && typeof item === 'object' && 'reason' in item) {
      const r = (item as Record<string, unknown>)['reason'];
      if (typeof r === 'string') result.push(r);
    }
  }
  return result;
}

/**
 * Wandelt DB-Zeilen in KpiAppRow um — stage_type wird über die
 * pipeline_stages-Map aufgelöst.
 */
function toKpiAppRows(
  rows: DbAppRow[],
  stageTypeMap: Map<string, string>,
): KpiAppRow[] {
  return rows.map((r) => ({
    id:          r.id,
    job_id:      r.job_id,
    source:      r.source ?? 'manual',
    score_label: (r.score_label as KpiAppRow['score_label']) ?? null,
    status:      r.status,
    stage_type:  r.stage_id ? (stageTypeMap.get(r.stage_id) ?? null) : null,
    applied_at:  r.applied_at,
  }));
}

/**
 * Baut die KpiInput-Felder appsWithOutbound, appsWithInbound,
 * firstOutboundAt und messagesPerApp aus Nachrichten + Conversations auf.
 */
function buildMessagingFields(
  messages: DbMessageRow[],
  convToApp: Map<string, string>,
): {
  appsWithOutbound: Set<string>;
  appsWithInbound: Set<string>;
  firstOutboundAt: Map<string, string>;
  messagesPerApp: Map<string, number>;
} {
  const appsWithOutbound = new Set<string>();
  const appsWithInbound  = new Set<string>();
  const firstOutboundAt  = new Map<string, string>();
  const messagesPerApp   = new Map<string, number>();

  for (const msg of messages) {
    const appId = convToApp.get(msg.conversation_id);
    if (!appId) continue;

    // Nachrichtenzähler je App
    messagesPerApp.set(appId, (messagesPerApp.get(appId) ?? 0) + 1);

    if (msg.direction === 'out') {
      appsWithOutbound.add(appId);
      // Früheste ausgehende Nachricht je App merken
      const existing = firstOutboundAt.get(appId);
      if (!existing || msg.created_at < existing) {
        firstOutboundAt.set(appId, msg.created_at);
      }
    } else {
      appsWithInbound.add(appId);
    }
  }

  return { appsWithOutbound, appsWithInbound, firstOutboundAt, messagesPerApp };
}

// ---------------------------------------------------------------------------
// Haupt-Funktion
// ---------------------------------------------------------------------------

/**
 * Lädt alle Recruiting-Daten für eine Agentur im gegebenen Zeitraum
 * und gibt das vollständige StatsPayload zurück.
 *
 * @param svc      Supabase-Service-Role-Client (umgeht RLS).
 * @param agencyId Pflichtfilter — alle Queries tragen diesen Wert.
 * @param filters  Zeitraum + optionale Einschränkungen.
 */
export async function getRecruitingStats(
  svc: SupabaseClient,
  agencyId: string,
  filters: StatsFilters,
): Promise<RecruitingStatsPayload> {
  const { from, to, jobId, source } = filters;

  // Vorzeitraum: gleiche Länge direkt davor
  const fromMs   = new Date(from).getTime();
  const toMs     = new Date(to).getTime();
  const duration = toMs - fromMs;
  const prevFrom = new Date(fromMs - duration).toISOString();
  const prevTo   = new Date(fromMs - 1).toISOString();

  // -------------------------------------------------------------------------
  // Schritt 1–3: pipeline_stages + applications (aktueller und Vorzeitraum) parallel.
  // Applications seitenweise – Supabase kappt sonst still bei 1000 Zeilen.
  // -------------------------------------------------------------------------
  const appSelect = 'id, job_id, source, score_label, score_reasons, status, stage_id, applied_at, assigned_to';
  const ladeApps = (von: string, bis: string) =>
    fetchAll<DbAppRow>((rFrom, rTo) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = svc
        .from('applications')
        .select(appSelect)
        .eq('agency_id', agencyId)
        .gte('applied_at', von)
        .lte('applied_at', bis);
      if (jobId)  q = q.eq('job_id', jobId);
      if (source) q = q.eq('source', source);
      return q.order('id').range(rFrom, rTo);
    });

  const [{ data: stagesRaw }, currApps, prevApps] = await Promise.all([
    svc
      .from('pipeline_stages')
      .select('id, stage_type')
      .eq('agency_id', agencyId) as unknown as Promise<{ data: DbPipelineStageRow[] | null }>,
    ladeApps(from, to),
    ladeApps(prevFrom, prevTo),
  ]);

  const stageTypeMap = new Map<string, string>();
  for (const s of stagesRaw ?? []) {
    stageTypeMap.set(s.id, s.stage_type);
  }

  // -------------------------------------------------------------------------
  // Schritt 4: conversations für alle App-IDs (beide Zeiträume), in Blöcken
  // -------------------------------------------------------------------------
  const allAppIds = [...new Set([...currApps.map((a) => a.id), ...prevApps.map((a) => a.id)])];

  const conversations: DbConvRow[] = await fetchAllIn<string, DbConvRow>(allAppIds, (chunk, rFrom, rTo) =>
    svc
      .from('conversations')
      .select('id, application_id, state')
      .eq('agency_id', agencyId)
      .in('application_id', chunk)
      .order('id')
      .range(rFrom, rTo) as unknown as PromiseLike<{ data: DbConvRow[] | null; error: { message: string } | null }>,
  );

  // conv_id → app_id-Map für Nachrichten-Auflösung
  const convToApp = new Map<string, string>();
  for (const c of conversations) {
    convToApp.set(c.id, c.application_id);
  }

  // -------------------------------------------------------------------------
  // Schritt 5: messages für alle conversation_ids
  // -------------------------------------------------------------------------
  const convIds = conversations.map((c) => c.id);
  const messages: DbMessageRow[] = await fetchAllIn<string, DbMessageRow>(convIds, (chunk, rFrom, rTo) =>
    svc
      .from('messages')
      .select('conversation_id, direction, sender_type, created_at')
      .eq('agency_id', agencyId)
      .in('conversation_id', chunk)
      .order('id')
      .range(rFrom, rTo) as unknown as PromiseLike<{ data: DbMessageRow[] | null; error: { message: string } | null }>,
  );

  const {
    appsWithOutbound,
    appsWithInbound,
    firstOutboundAt,
    messagesPerApp,
  } = buildMessagingFields(messages, convToApp);

  // -------------------------------------------------------------------------
  // Schritt 6: appointments für alle app_ids
  // -------------------------------------------------------------------------
  const appointments: DbAppointmentRow[] = await fetchAllIn<string, DbAppointmentRow>(allAppIds, (chunk, rFrom, rTo) =>
    svc
      .from('appointments')
      .select('application_id, status, starts_at, created_at')
      .eq('agency_id', agencyId)
      .in('application_id', chunk)
      .order('id')
      .range(rFrom, rTo) as unknown as PromiseLike<{ data: DbAppointmentRow[] | null; error: { message: string } | null }>,
  );

  // -------------------------------------------------------------------------
  // Schritt 7: jobs für Jobtabelle
  // -------------------------------------------------------------------------
  const currJobIds = [...new Set(currApps.map((a) => a.job_id).filter(Boolean))];
  let jobs: DbJobRow[] = [];
  if (currJobIds.length > 0) {
    const { data: jobsRaw } = await (svc
      .from('jobs')
      .select('id, title, status')
      .eq('agency_id', agencyId)
      .in('id', currJobIds) as unknown as Promise<{ data: DbJobRow[] | null }>);
    jobs = jobsRaw ?? [];
  }

  // -------------------------------------------------------------------------
  // Schritt 8: Knockout-Gründe aus score_reasons extrahieren
  // -------------------------------------------------------------------------
  const knockoutReasons: string[] = [];
  for (const app of currApps) {
    knockoutReasons.push(...extractKnockoutReasons(app.score_reasons));
  }

  // -------------------------------------------------------------------------
  // KpiInput für aktuellen Zeitraum aufbauen
  // -------------------------------------------------------------------------
  const currAppIds = new Set(currApps.map((a) => a.id));
  const currConvIds = new Set(
    conversations.filter((c) => currAppIds.has(c.application_id)).map((c) => c.id),
  );

  const currConvs = conversations.filter((c) => currAppIds.has(c.application_id));
  const currInput: KpiInput = {
    apps: toKpiAppRows(currApps, stageTypeMap),
    appsWithOutbound: new Set([...appsWithOutbound].filter((id) => currAppIds.has(id))),
    appsWithInbound:  new Set([...appsWithInbound].filter((id) => currAppIds.has(id))),
    firstOutboundAt:  new Map([...firstOutboundAt].filter(([id]) => currAppIds.has(id))),
    appointments: currApps
      .flatMap((a) =>
        appointments
          .filter((t) => t.application_id === a.id)
          .map((t) => ({ application_id: t.application_id, status: t.status, created_at: t.created_at })),
      ),
    botConversations: {
      total:      currConvs.length,
      handedOver: currConvs.filter((c) => c.state === 'human_active').length,
      messagesPerApp: new Map([...messagesPerApp].filter(([id]) => currAppIds.has(id))),
    },
  };

  // KPI-Berechnung aktueller Zeitraum
  const kpis = computeRecruitingKpis(currInput, knockoutReasons);

  // -------------------------------------------------------------------------
  // previousTiles: gleiche Logik, aber nur Tiles für den Vorzeitraum
  // -------------------------------------------------------------------------
  const prevAppIds = new Set(prevApps.map((a) => a.id));
  const prevConvs  = conversations.filter((c) => prevAppIds.has(c.application_id));

  const prevInput: KpiInput = {
    apps: toKpiAppRows(prevApps, stageTypeMap),
    appsWithOutbound: new Set([...appsWithOutbound].filter((id) => prevAppIds.has(id))),
    appsWithInbound:  new Set([...appsWithInbound].filter((id) => prevAppIds.has(id))),
    firstOutboundAt:  new Map([...firstOutboundAt].filter(([id]) => prevAppIds.has(id))),
    appointments: prevApps.flatMap((a) =>
      appointments
        .filter((t) => t.application_id === a.id)
        .map((t) => ({ application_id: t.application_id, status: t.status, created_at: t.created_at })),
    ),
    botConversations: {
      total:      prevConvs.length,
      handedOver: prevConvs.filter((c) => c.state === 'human_active').length,
      messagesPerApp: new Map([...messagesPerApp].filter(([id]) => prevAppIds.has(id))),
    },
  };

  const prevKpis = computeRecruitingKpis(prevInput, []);
  const previousTiles = prevKpis.tiles;

  // -------------------------------------------------------------------------
  // Jobtabelle aufbauen
  // -------------------------------------------------------------------------
  const jobMap = new Map<string, DbJobRow>(jobs.map((j) => [j.id, j]));

  // Apps je Job gruppieren
  const appsByJob = new Map<string, DbAppRow[]>();
  for (const app of currApps) {
    const list = appsByJob.get(app.job_id) ?? [];
    list.push(app);
    appsByJob.set(app.job_id, list);
  }

  // Alle aktiven Jobs, die ggf. keine Bewerbungen haben, ebenfalls einfügen
  for (const job of jobs) {
    if (job.status === 'active' && !appsByJob.has(job.id)) {
      appsByJob.set(job.id, []);
    }
  }

  const BOOKED_STATUSES = new Set(['booked', 'confirmed', 'done', 'no_show']);

  const jobsTable: JobTableRow[] = Array.from(appsByJob.entries()).map(([jId, jApps]) => {
    const jobMeta = jobMap.get(jId);
    const qualified = jApps.filter((a) => a.score_label === 'A' || a.score_label === 'B');
    const withOpening = jApps.filter((a) => appsWithOutbound.has(a.id));
    const withReply   = jApps.filter((a) => appsWithInbound.has(a.id));
    const termine = new Set(
      appointments
        .filter((t) => jApps.some((a) => a.id === t.application_id) && BOOKED_STATUSES.has(t.status))
        .map((t) => t.application_id),
    ).size;
    const einstellungen = jApps.filter(
      (a) => a.status === 'hired' || stageTypeMap.get(a.stage_id ?? '') === 'hired',
    ).length;

    return {
      jobId:        jId,
      title:        jobMeta?.title ?? jId,
      status:       jobMeta?.status ?? 'unknown',
      bewerbungen:  jApps.length,
      antwortquote: withOpening.length > 0 ? withReply.length / withOpening.length : null,
      qualifiziert: qualified.length,
      termine,
      einstellungen,
    };
  });

  // -------------------------------------------------------------------------
  // Tasks aufbauen
  // -------------------------------------------------------------------------
  const todayUtc = new Date().toISOString().slice(0, 10);

  const brauchtMensch = conversations.filter(
    (c) => currAppIds.has(c.application_id) && c.state === 'human_active',
  ).length;

  const qualifiziertOhneAktion = currApps.filter(
    (a) =>
      (a.score_label === 'A' || a.score_label === 'B') &&
      (a.assigned_to === null || a.assigned_to === undefined),
  ).length;

  const termineHeute = appointments.filter(
    (t) =>
      currAppIds.has(t.application_id) &&
      (t.status === 'booked' || t.status === 'confirmed') &&
      t.starts_at?.slice(0, 10) === todayUtc,
  ).length;

  // Nur um TypeScript den currConvIds-Gebrauch zu signalisieren
  void currConvIds;

  return {
    kpis,
    previousTiles,
    jobsTable,
    tasks: { brauchtMensch, qualifiziertOhneAktion, termineHeute },
  };
}
