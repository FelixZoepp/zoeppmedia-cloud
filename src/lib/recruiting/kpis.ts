import { SupabaseClient } from '@supabase/supabase-js';

interface KpiPeriod {
  from: string; // ISO date
  to: string; // ISO date
}

interface Warning {
  key: string;
  nachricht: string;
  schwere: 'warnung' | 'kritisch';
  aktueller_wert: number;
}

interface RecruitingKpis {
  period: KpiPeriod;
  bewerbungen_monat: number;
  zeit_bis_erstkontakt_stunden: number | null;
  quote_erstgespraech: number | null;
  quote_vorstellungsgespraech: number | null;
  show_rate_probetag: number | null;
  quote_qualiwoche: number | null;
  einstellungen_monat: number;
  kosten_je_einstellung: number | null;
  warnungen: Warning[];
}

/**
 * Calculates recruiting KPIs for an agency based on candidate_stage_events.
 *
 * If no period is given, defaults to the current calendar month.
 */
export async function calculateRecruitingKpis(
  supabase: SupabaseClient,
  agencyId: string,
  period?: KpiPeriod
): Promise<RecruitingKpis> {
  // Default to current month
  const now = new Date();
  const from =
    period?.from ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const to = period?.to ?? now.toISOString();

  // Get all candidates for this agency
  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, created_at, recruiting_status, kosten_zugeordnet, erster_kontaktversuch_am, eingestellt_am')
    .eq('agency_id', agencyId)
    .gte('created_at', from)
    .lte('created_at', to);

  const allCandidates = candidates ?? [];

  // Get all stage events for these candidates in the period
  const candidateIds = allCandidates.map((c) => c.id);

  let events: Array<{
    candidate_id: string;
    von_stage: string | null;
    nach_stage: string;
    zeitpunkt: string;
  }> = [];

  if (candidateIds.length > 0) {
    const { data: eventData } = await supabase
      .from('candidate_stage_events')
      .select('candidate_id, von_stage, nach_stage, zeitpunkt')
      .in('candidate_id', candidateIds)
      .gte('zeitpunkt', from)
      .lte('zeitpunkt', to)
      .order('zeitpunkt', { ascending: true });

    events = eventData ?? [];
  }

  // Count candidates reaching each stage
  const stageReached = new Map<string, Set<string>>();
  for (const event of events) {
    if (!stageReached.has(event.nach_stage)) {
      stageReached.set(event.nach_stage, new Set());
    }
    stageReached.get(event.nach_stage)!.add(event.candidate_id);
  }

  const countAtStage = (stage: string): number =>
    stageReached.get(stage)?.size ?? 0;

  // bewerbungen_monat: total candidates in period
  const bewerbungen_monat = allCandidates.length;

  // zeit_bis_erstkontakt: avg time from creation to erstkontakt event
  const erstkontaktTimes: number[] = [];
  for (const candidate of allCandidates) {
    if (candidate.erster_kontaktversuch_am) {
      const created = new Date(candidate.created_at).getTime();
      const kontakt = new Date(candidate.erster_kontaktversuch_am).getTime();
      const diffHours = (kontakt - created) / (1000 * 60 * 60);
      if (diffHours >= 0) {
        erstkontaktTimes.push(diffHours);
      }
    }
  }
  const zeit_bis_erstkontakt_stunden =
    erstkontaktTimes.length > 0
      ? Math.round(
          (erstkontaktTimes.reduce((a, b) => a + b, 0) / erstkontaktTimes.length) * 100
        ) / 100
      : null;

  // Conversion quotes
  const eingangCount = countAtStage('eingang') || bewerbungen_monat;
  const erstgespraechCount = countAtStage('erstgespraech');
  const vgCount = countAtStage('vorstellungsgespraech');
  const probetagCount = countAtStage('probetag');
  const qualiWocheCount = countAtStage('quali_woche');

  const safeQuote = (num: number, denom: number): number | null =>
    denom > 0 ? Math.round((num / denom) * 1000) / 1000 : null;

  const quote_erstgespraech = safeQuote(erstgespraechCount, eingangCount);
  const quote_vorstellungsgespraech = safeQuote(vgCount, erstgespraechCount);
  const show_rate_probetag = safeQuote(probetagCount, vgCount);
  const quote_qualiwoche = safeQuote(qualiWocheCount, probetagCount);

  // einstellungen_monat
  const einstellungen_monat = allCandidates.filter(
    (c) => c.recruiting_status === 'eingestellt'
  ).length;

  // kosten_je_einstellung
  const totalKosten = allCandidates.reduce(
    (sum, c) => sum + (Number(c.kosten_zugeordnet) || 0),
    0
  );
  const kosten_je_einstellung =
    einstellungen_monat > 0
      ? Math.round((totalKosten / einstellungen_monat) * 100) / 100
      : null;

  // Evaluate warnings from template rules
  const warnungen = evaluateWarnings({
    bewerbungen_monat,
    zeit_bis_erstkontakt_stunden,
    show_rate_probetag,
    einstellungen_monat,
    kosten_je_einstellung,
  });

  return {
    period: { from, to },
    bewerbungen_monat,
    zeit_bis_erstkontakt_stunden,
    quote_erstgespraech,
    quote_vorstellungsgespraech,
    show_rate_probetag,
    quote_qualiwoche,
    einstellungen_monat,
    kosten_je_einstellung,
    warnungen,
  };
}

/**
 * Evaluates warning rules against current KPI values.
 * Based on the template's warnungen definitions.
 */
function evaluateWarnings(kpis: {
  bewerbungen_monat: number;
  zeit_bis_erstkontakt_stunden: number | null;
  show_rate_probetag: number | null;
  einstellungen_monat: number;
  kosten_je_einstellung: number | null;
}): Warning[] {
  const warnings: Warning[] = [];

  if (
    kpis.zeit_bis_erstkontakt_stunden !== null &&
    kpis.zeit_bis_erstkontakt_stunden > 4
  ) {
    warnings.push({
      key: 'erstkontakt_zu_langsam',
      nachricht: 'Durchschnittliche Erstkontaktzeit über 4 Stunden',
      schwere: 'warnung',
      aktueller_wert: kpis.zeit_bis_erstkontakt_stunden,
    });
  }

  if (kpis.bewerbungen_monat < 30) {
    warnings.push({
      key: 'wenig_bewerbungen',
      nachricht: 'Weniger als 30 Bewerbungen diesen Monat',
      schwere: 'warnung',
      aktueller_wert: kpis.bewerbungen_monat,
    });
  }

  if (kpis.show_rate_probetag !== null && kpis.show_rate_probetag < 0.5) {
    warnings.push({
      key: 'niedrige_show_rate',
      nachricht: 'Show-Rate Probetag unter 50%',
      schwere: 'kritisch',
      aktueller_wert: kpis.show_rate_probetag,
    });
  }

  if (kpis.einstellungen_monat === 0) {
    warnings.push({
      key: 'keine_einstellungen',
      nachricht: 'Keine Einstellungen diesen Monat',
      schwere: 'kritisch',
      aktueller_wert: 0,
    });
  }

  if (
    kpis.kosten_je_einstellung !== null &&
    kpis.kosten_je_einstellung > 800
  ) {
    warnings.push({
      key: 'hohe_kosten',
      nachricht: 'Kosten je Einstellung über 800€',
      schwere: 'warnung',
      aktueller_wert: kpis.kosten_je_einstellung,
    });
  }

  return warnings;
}
