/**
 * KPI-Rechenkern für Recruiting-Statistiken (Phase 6 Task 3).
 * Pure Funktionen — kein Supabase-Import, keine Seiteneffekte.
 * Alle Quoten folgen Spec §12.
 */

// ---------------------------------------------------------------------------
// Interfaces — buchstabengetreu nach Task-3-Brief (Task 4 baut darauf auf)
// ---------------------------------------------------------------------------

export interface KpiAppRow {
  id: string;
  job_id: string;
  source: string;
  score_label: 'A' | 'B' | 'C' | null;
  status: string;
  stage_type: string | null;
  applied_at: string;
}

export interface KpiAppointmentRow {
  application_id: string;
  status: string;
  created_at: string;
}

export interface KpiInput {
  apps: KpiAppRow[];
  appsWithOutbound: Set<string>;        // application_ids mit ≥1 ausgehender Nachricht
  appsWithInbound: Set<string>;         // application_ids mit ≥1 eingehender Nachricht
  firstOutboundAt: Map<string, string>; // application_id → ISO-Zeit der ersten ausgehenden Nachricht
  appointments: KpiAppointmentRow[];
  botConversations: {
    total: number;
    handedOver: number;
    messagesPerApp: Map<string, number>;
  };
}

export interface KpiTiles {
  bewerbungen: number;
  antwortquote: number | null;
  vorqualiAbgeschlossen: number;
  qualifiziert: number;
  termineGebucht: number;
  noShowQuote: number | null;
  einstellungen: number;
}

export interface FunnelStep {
  key: string;
  label: string;
  count: number;
  dropRate: number | null;
}

export interface SourceStats {
  source: string;
  count: number;
  qualifizierungsquote: number | null;
  terminquote: number | null;
}

export interface RecruitingKpis {
  tiles: KpiTiles;
  funnel: FunnelStep[];
  sources: SourceStats[];
  timeline: Array<{ day: string; bySource: Record<string, number> }>;
  bot: {
    abschlussquote: number | null;
    avgNachrichten: number | null;
    uebergabequote: number | null;
    topKnockouts: Array<{ reason: string; count: number }>;
  };
  medianErstkontaktSek: number | null;
  medianTerminSek: number | null;
}

// ---------------------------------------------------------------------------
// Interne Konstanten
// ---------------------------------------------------------------------------

/** Termin-Status, die als „gebucht" zählen (§12) */
const BOOKED_STATUSES = new Set(['booked', 'confirmed', 'done', 'no_show']);

/** Termin-Status, die als „fällig" zählen (§12) */
const DUE_STATUSES = new Set(['done', 'no_show']);

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

/**
 * Berechnet den Median einer Zahlen-Liste.
 * Gibt null zurück, wenn die Liste leer ist.
 */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Sichere Division: gibt null zurück, wenn der Nenner 0 ist.
 * Verhindert NaN in allen Quoten.
 */
function ratio(num: number, den: number): number | null {
  return den > 0 ? num / den : null;
}

/**
 * ISO-Zeitstring → Unix-Millisekunden.
 */
function ms(isoStr: string): number {
  return new Date(isoStr).getTime();
}

/**
 * ISO-Zeitstring → YYYY-MM-DD (UTC-Tag).
 */
function toDay(isoStr: string): string {
  return isoStr.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Haupt-Funktion
// ---------------------------------------------------------------------------

/**
 * Berechnet alle Recruiting-KPIs aus dem vorbereiteten Input.
 *
 * @param input           Vorbereitete Mengen und Listen aus dem Datenbankabfrage-Layer.
 * @param knockoutReasons Flache Liste aller Knockout-Gründe (vom Aufrufer aus score_reasons extrahiert).
 */
export function computeRecruitingKpis(
  input: KpiInput,
  knockoutReasons: string[],
): RecruitingKpis {
  const {
    apps,
    appsWithOutbound,
    appsWithInbound,
    firstOutboundAt,
    appointments,
    botConversations,
  } = input;

  // --- Kerngruppen nach Spec §12 ---

  /** Apps mit ≥1 Eröffnung (ausgehende Nachricht) */
  const withOpening = apps.filter((a) => appsWithOutbound.has(a.id));

  /** Apps mit ≥1 Antwort (eingehende Nachricht) */
  const withReply = apps.filter((a) => appsWithInbound.has(a.id));

  /** Apps mit gesetztem score_label (Vorqualifizierung abgeschlossen) */
  const completed = apps.filter((a) => a.score_label !== null);

  /** Qualifizierte Apps (A oder B) */
  const qualified = apps.filter(
    (a) => a.score_label === 'A' || a.score_label === 'B',
  );

  /** Eingestellte Bewerber: status='hired' ODER stage_type='hired' */
  const hired = apps.filter(
    (a) => a.status === 'hired' || a.stage_type === 'hired',
  );

  // --- Termine ---

  /** Eindeutige Application-IDs mit ≥1 gebuchtem Termin */
  const appsWithBookedAppt = new Set(
    appointments
      .filter((t) => BOOKED_STATUSES.has(t.status))
      .map((t) => t.application_id),
  );

  /** Fällige Termine (done oder no_show) */
  const dueAppts = appointments.filter((t) => DUE_STATUSES.has(t.status));

  /** No-Show-Termine */
  const noShowAppts = appointments.filter((t) => t.status === 'no_show');

  // -------------------------------------------------------------------------
  // Tiles
  // -------------------------------------------------------------------------
  const tiles: KpiTiles = {
    bewerbungen: apps.length,
    antwortquote: ratio(withReply.length, withOpening.length),
    vorqualiAbgeschlossen: completed.length,
    qualifiziert: qualified.length,
    termineGebucht: appsWithBookedAppt.size,
    noShowQuote: ratio(noShowAppts.length, dueAppts.length),
    einstellungen: hired.length,
  };

  // -------------------------------------------------------------------------
  // Funnel (6 Stufen, Reihenfolge: bewerbung → antwort → vorquali → qualifiziert → termin → eingestellt)
  // -------------------------------------------------------------------------
  const funnelCounts: Array<{ key: string; label: string; count: number }> = [
    { key: 'bewerbung',    label: 'Bewerbungen',            count: apps.length },
    { key: 'antwort',     label: 'Mit Antwort',             count: withReply.length },
    { key: 'vorquali',    label: 'Vorquali abgeschlossen',  count: completed.length },
    { key: 'qualifiziert',label: 'Qualifiziert (A/B)',      count: qualified.length },
    { key: 'termin',      label: 'Termin gebucht',          count: appsWithBookedAppt.size },
    { key: 'eingestellt', label: 'Eingestellt',             count: hired.length },
  ];

  const funnel: FunnelStep[] = funnelCounts.map((step, idx) => {
    if (idx === 0) {
      return { ...step, dropRate: null };
    }
    const prevCount = funnelCounts[idx - 1].count;
    return {
      ...step,
      dropRate: prevCount > 0 ? 1 - step.count / prevCount : null,
    };
  });

  // -------------------------------------------------------------------------
  // Sources (Qualifizierungs- und Terminquote je Quelle)
  // -------------------------------------------------------------------------

  /** Gruppiert Apps nach source */
  const bySource = new Map<string, KpiAppRow[]>();
  for (const app of apps) {
    const list = bySource.get(app.source) ?? [];
    list.push(app);
    bySource.set(app.source, list);
  }

  const sources: SourceStats[] = Array.from(bySource.entries()).map(
    ([source, sourceApps]) => {
      const srcCompleted = sourceApps.filter((a) => a.score_label !== null);
      const srcQualified = sourceApps.filter(
        (a) => a.score_label === 'A' || a.score_label === 'B',
      );
      const srcWithBooked = srcQualified.filter((a) =>
        appsWithBookedAppt.has(a.id),
      );

      return {
        source,
        count: sourceApps.length,
        qualifizierungsquote: ratio(srcQualified.length, srcCompleted.length),
        terminquote: ratio(srcWithBooked.length, srcQualified.length),
      };
    },
  );

  // -------------------------------------------------------------------------
  // Timeline (YYYY-MM-DD gruppiert, aufsteigend sortiert)
  // -------------------------------------------------------------------------

  const timelineMap = new Map<string, Record<string, number>>();
  for (const app of apps) {
    const day = toDay(app.applied_at);
    const bySourceForDay = timelineMap.get(day) ?? {};
    bySourceForDay[app.source] = (bySourceForDay[app.source] ?? 0) + 1;
    timelineMap.set(day, bySourceForDay);
  }

  const timeline = Array.from(timelineMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, bySourceRecord]) => ({ day, bySource: bySourceRecord }));

  // -------------------------------------------------------------------------
  // Bot-Statistiken
  // -------------------------------------------------------------------------

  /** abschlussquote = completed ÷ withReply */
  const abschlussquote = ratio(completed.length, withReply.length);

  /** avgNachrichten = Mittelwert über messagesPerApp der Apps mit Antwort */
  const replyIds = new Set(withReply.map((a) => a.id));
  const messageCounts: number[] = [];
  for (const [appId, count] of botConversations.messagesPerApp.entries()) {
    if (replyIds.has(appId)) {
      messageCounts.push(count);
    }
  }
  const avgNachrichten =
    messageCounts.length > 0
      ? messageCounts.reduce((s, v) => s + v, 0) / messageCounts.length
      : null;

  const uebergabequote = ratio(
    botConversations.handedOver,
    botConversations.total,
  );

  /** topKnockouts: die 5 häufigsten Reasons, absteigend sortiert */
  const reasonCounts = new Map<string, number>();
  for (const reason of knockoutReasons) {
    reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
  }
  const topKnockouts = Array.from(reasonCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([reason, count]) => ({ reason, count }));

  // -------------------------------------------------------------------------
  // Mediane Zeitberechnungen
  // -------------------------------------------------------------------------

  /** medianErstkontaktSek: Median über (firstOutbound − applied_at) in Sekunden */
  const erstkontaktSekunden: number[] = [];
  for (const [appId, outboundIso] of firstOutboundAt.entries()) {
    const app = apps.find((a) => a.id === appId);
    if (app) {
      erstkontaktSekunden.push((ms(outboundIso) - ms(app.applied_at)) / 1000);
    }
  }
  const medianErstkontaktSek = median(erstkontaktSekunden);

  /** medianTerminSek: frühester gebuchter Termin je App − applied_at, dann Median */
  // Gruppiert Termine nach application_id, nimmt das früheste pro App
  const earliestApptByApp = new Map<string, number>();
  for (const appt of appointments) {
    if (!BOOKED_STATUSES.has(appt.status)) continue;
    const apptMs = ms(appt.created_at);
    const existing = earliestApptByApp.get(appt.application_id);
    if (existing === undefined || apptMs < existing) {
      earliestApptByApp.set(appt.application_id, apptMs);
    }
  }
  const terminSekunden: number[] = [];
  for (const [appId, apptMs] of earliestApptByApp.entries()) {
    const app = apps.find((a) => a.id === appId);
    if (app) {
      terminSekunden.push((apptMs - ms(app.applied_at)) / 1000);
    }
  }
  const medianTerminSek = median(terminSekunden);

  // -------------------------------------------------------------------------
  // Rückgabe
  // -------------------------------------------------------------------------
  return {
    tiles,
    funnel,
    sources,
    timeline,
    bot: {
      abschlussquote,
      avgNachrichten,
      uebergabequote,
      topKnockouts,
    },
    medianErstkontaktSek,
    medianTerminSek,
  };
}
