import { SupabaseClient } from '@supabase/supabase-js';

export type ReportTyp = 'tag_7' | 'tag_14';

interface Tag7Data {
  zeitraum: string;
  kampagnen_live_seit: string;
  spend: number;
  impressionen: number;
  klicks: number;
  leads: number;
  cpl: number;
  bewerbungen: number;
  termine: number;
  was_in_woche_2_passiert: string;
}

interface Tag14Data {
  zeitraum: string;
  spend_w2: number;
  spend_w1: number;
  spend_delta: string;
  leads_w2: number;
  leads_w1: number;
  leads_delta: string;
  cpl_w2: number;
  cpl_w1: number;
  terminquote: string;
  show_rate: string;
  empfehlung_budget: string;
  empfehlung_creatives: string;
}

function formatDelta(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '0%';
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

function toDateString(d: Date): string {
  return d.toISOString().split('T')[0];
}

async function getMetaData(
  supabase: SupabaseClient,
  agencyId: string,
  from: Date,
  to: Date,
) {
  const { data } = await supabase
    .from('meta_ad_reports')
    .select('spend, impressions, clicks, leads, cpl')
    .eq('agency_id', agencyId)
    .gte('report_date', toDateString(from))
    .lte('report_date', toDateString(to));

  const rows = data || [];
  return {
    spend: rows.reduce((s, r) => s + (r.spend || 0), 0),
    impressions: rows.reduce((s, r) => s + (r.impressions || 0), 0),
    clicks: rows.reduce((s, r) => s + (r.clicks || 0), 0),
    leads: rows.reduce((s, r) => s + (r.leads || 0), 0),
    cpl:
      rows.length > 0
        ? Math.round(
            (rows.reduce((s, r) => s + (r.spend || 0), 0) /
              Math.max(1, rows.reduce((s, r) => s + (r.leads || 0), 0))) *
              100,
          ) / 100
        : 0,
  };
}

async function getCandidateCount(
  supabase: SupabaseClient,
  agencyId: string,
  from: Date,
  to: Date,
) {
  const { data } = await supabase
    .from('candidates')
    .select('id')
    .eq('agency_id', agencyId)
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString());

  return data?.length || 0;
}

async function getTermineCount(
  supabase: SupabaseClient,
  agencyId: string,
  from: Date,
  to: Date,
) {
  const { data } = await supabase
    .from('call_logs')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('result', 'termin_vereinbart')
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString());

  return data?.length || 0;
}

async function getShowRate(
  supabase: SupabaseClient,
  agencyId: string,
  from: Date,
  to: Date,
): Promise<string> {
  // Get all candidates with termin_vereinbart calls in the period
  const { data: terminCalls } = await supabase
    .from('call_logs')
    .select('candidate_id')
    .eq('agency_id', agencyId)
    .eq('result', 'termin_vereinbart')
    .gte('created_at', from.toISOString())
    .lte('created_at', to.toISOString());

  if (!terminCalls?.length) return '0%';

  const candidateIds = [...new Set(terminCalls.map((c) => c.candidate_id))];

  // Check how many of those actually showed (have a stage beyond termin)
  // Look for candidate_stages changes that happened after the termin call
  const { data: stages } = await supabase
    .from('pipeline_stages')
    .select('id, sort_order')
    .order('sort_order');

  if (!stages?.length) return '0%';

  // Find the "Termin" stage sort_order
  const terminStage = stages.find(
    (s) =>
      s.sort_order >= 3 ||
      false, // fallback: stages with sort_order >= 3 are post-termin
  );
  const minShowOrder = terminStage ? terminStage.sort_order + 1 : 4;

  // Get current stages for these candidates
  const { data: candidates } = await supabase
    .from('candidates')
    .select('id, current_stage_id')
    .in('id', candidateIds);

  if (!candidates?.length) return '0%';

  const stageMap = new Map(stages.map((s) => [s.id, s.sort_order]));
  const showed = candidates.filter((c) => {
    const order = stageMap.get(c.current_stage_id);
    return order !== undefined && order >= minShowOrder;
  }).length;

  const rate = Math.round((showed / candidateIds.length) * 100);
  return `${rate}%`;
}

export async function generateReport(
  supabase: SupabaseClient,
  agencyId: string,
  typ: ReportTyp,
): Promise<Tag7Data | Tag14Data> {
  // Get agency garantie_start
  const { data: agency } = await supabase
    .from('agencies')
    .select('garantie_start')
    .eq('id', agencyId)
    .single();

  if (!agency?.garantie_start) {
    throw new Error('Kein Garantie-Start gesetzt');
  }

  const start = new Date(agency.garantie_start);

  if (typ === 'tag_7') {
    const from = new Date(start);
    const to = new Date(start);
    to.setDate(to.getDate() + 6); // Day 1-7
    to.setHours(23, 59, 59, 999);

    const meta = await getMetaData(supabase, agencyId, from, to);
    const bewerbungen = await getCandidateCount(supabase, agencyId, from, to);
    const termine = await getTermineCount(supabase, agencyId, from, to);

    const result: Tag7Data = {
      zeitraum: 'Tag 1-7',
      kampagnen_live_seit: toDateString(start),
      spend: Math.round(meta.spend * 100) / 100,
      impressionen: meta.impressions,
      klicks: meta.clicks,
      leads: meta.leads,
      cpl: meta.cpl,
      bewerbungen,
      termine,
      was_in_woche_2_passiert:
        'Winkel-Rotation, neue Creatives testen, Budget-Anpassung basierend auf CPL',
    };

    return result;
  }

  // tag_14: compare week 1 vs week 2
  const w1From = new Date(start);
  const w1To = new Date(start);
  w1To.setDate(w1To.getDate() + 6);
  w1To.setHours(23, 59, 59, 999);

  const w2From = new Date(start);
  w2From.setDate(w2From.getDate() + 7);
  const w2To = new Date(start);
  w2To.setDate(w2To.getDate() + 13);
  w2To.setHours(23, 59, 59, 999);

  const metaW1 = await getMetaData(supabase, agencyId, w1From, w1To);
  const metaW2 = await getMetaData(supabase, agencyId, w2From, w2To);

  const termineW1 = await getTermineCount(supabase, agencyId, w1From, w1To);
  const termineW2 = await getTermineCount(supabase, agencyId, w2From, w2To);
  const bewerbungenW2 = await getCandidateCount(supabase, agencyId, w2From, w2To);
  const totalTermine = termineW1 + termineW2;

  const showRate = await getShowRate(supabase, agencyId, w1From, w2To);

  const totalBewerbungen =
    (await getCandidateCount(supabase, agencyId, w1From, w1To)) + bewerbungenW2;
  const terminquote =
    totalBewerbungen > 0
      ? `${Math.round((totalTermine / totalBewerbungen) * 100)}%`
      : '0%';

  // Generate recommendations based on data
  let empfehlungBudget = 'Budget stabil halten';
  if (metaW2.cpl < metaW1.cpl * 0.8) {
    empfehlungBudget = 'CPL sinkt — Budget erhoehen fuer mehr Volumen';
  } else if (metaW2.cpl > metaW1.cpl * 1.3) {
    empfehlungBudget = 'CPL steigt — Creatives und Winkel pruefen, ggf. Budget reduzieren';
  }

  let empfehlungCreatives = 'Aktuelle Creatives weiter testen';
  if (metaW2.leads > metaW1.leads) {
    empfehlungCreatives = 'Aktuelle Creatives performen gut — mehr Varianten im gleichen Stil testen';
  } else if (metaW2.leads < metaW1.leads) {
    empfehlungCreatives = 'Lead-Volumen ruecklaeufig — neue Winkel und Formate testen';
  }

  const result: Tag14Data = {
    zeitraum: 'Tag 8-14',
    spend_w2: Math.round(metaW2.spend * 100) / 100,
    spend_w1: Math.round(metaW1.spend * 100) / 100,
    spend_delta: formatDelta(metaW2.spend, metaW1.spend),
    leads_w2: metaW2.leads,
    leads_w1: metaW1.leads,
    leads_delta: formatDelta(metaW2.leads, metaW1.leads),
    cpl_w2: metaW2.cpl,
    cpl_w1: metaW1.cpl,
    terminquote,
    show_rate: showRate,
    empfehlung_budget: empfehlungBudget,
    empfehlung_creatives: empfehlungCreatives,
  };

  return result;
}
