import { SupabaseClient } from '@supabase/supabase-js';

export type CheckErgebnis = 'ok' | 'warnung' | 'fehler';
export type CheckTyp = 'canary_bewerbung' | 'pixel' | 'stille' | 'werbekonto';

export interface CheckResult {
  ergebnis: CheckErgebnis;
  details: Record<string, unknown>;
}

/**
 * Stille-Check: Agency normally gets daily candidates but had 0 for 48 hours.
 * Query: count candidates in last 48h vs avg daily rate in last 30 days.
 * If avg > 1/day and last 48h = 0 -> fehler
 */
export async function checkStille(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<CheckResult> {
  const now = new Date();

  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  // Count candidates in last 30 days
  const { data: last30 } = await supabase
    .from('candidates')
    .select('id')
    .eq('agency_id', agencyId)
    .gte('created_at', thirtyDaysAgo.toISOString());

  const totalLast30 = last30?.length || 0;
  const avgPerDay = totalLast30 / 30;

  // Count candidates in last 48h
  const { data: last48h } = await supabase
    .from('candidates')
    .select('id')
    .eq('agency_id', agencyId)
    .gte('created_at', fortyEightHoursAgo.toISOString());

  const countLast48h = last48h?.length || 0;

  if (avgPerDay > 1 && countLast48h === 0) {
    return {
      ergebnis: 'fehler',
      details: {
        avg_pro_tag: Math.round(avgPerDay * 10) / 10,
        letzte_48h: 0,
        hinweis: 'Keine Bewerbungen seit 48 Stunden bei normalem Durchschnitt > 1/Tag',
      },
    };
  }

  if (avgPerDay > 0.5 && countLast48h === 0) {
    return {
      ergebnis: 'warnung',
      details: {
        avg_pro_tag: Math.round(avgPerDay * 10) / 10,
        letzte_48h: 0,
        hinweis: 'Keine Bewerbungen seit 48 Stunden',
      },
    };
  }

  return {
    ergebnis: 'ok',
    details: {
      avg_pro_tag: Math.round(avgPerDay * 10) / 10,
      letzte_48h: countLast48h,
    },
  };
}

/**
 * Werbekonto-Check: Meta ad spend is 0 today when it was >0 yesterday.
 * Possible payment issue or campaign pause.
 */
export async function checkWerbekonto(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<CheckResult> {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = yesterday.toISOString().split('T')[0];

  // Get today's spend
  const { data: todayData } = await supabase
    .from('meta_ad_reports')
    .select('spend')
    .eq('agency_id', agencyId)
    .eq('report_date', todayStr);

  const todaySpend = todayData?.reduce((s, r) => s + (r.spend || 0), 0) || 0;

  // Get yesterday's spend
  const { data: yesterdayData } = await supabase
    .from('meta_ad_reports')
    .select('spend')
    .eq('agency_id', agencyId)
    .eq('report_date', yesterdayStr);

  const yesterdaySpend = yesterdayData?.reduce((s, r) => s + (r.spend || 0), 0) || 0;

  if (yesterdaySpend > 0 && todaySpend === 0) {
    return {
      ergebnis: 'fehler',
      details: {
        spend_heute: 0,
        spend_gestern: yesterdaySpend,
        hinweis: 'Werbekonto hat heute keinen Spend — gestern waren es ' +
          yesterdaySpend.toFixed(2) + ' EUR. Moegliches Zahlungsproblem.',
      },
    };
  }

  // No yesterday data — can't compare
  if (!yesterdayData?.length) {
    return {
      ergebnis: 'ok',
      details: {
        spend_heute: todaySpend,
        spend_gestern: null,
        hinweis: 'Keine Vergleichsdaten von gestern vorhanden',
      },
    };
  }

  return {
    ergebnis: 'ok',
    details: {
      spend_heute: todaySpend,
      spend_gestern: yesterdaySpend,
    },
  };
}

/**
 * Pixel-Check: After funnel deploy, check if any candidates arrived in last 24h
 * with source='meta'. If funnel is published but no meta candidates in 24h -> warnung.
 */
export async function checkPixel(
  supabase: SupabaseClient,
  agencyId: string,
): Promise<CheckResult> {
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // Check if agency has any meta candidates ever (funnel is deployed)
  const { data: allMeta } = await supabase
    .from('candidates')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('source', 'meta')
    .limit(1);

  // If no meta candidates ever, funnel probably not deployed yet — skip
  if (!allMeta?.length) {
    return {
      ergebnis: 'ok',
      details: {
        meta_bewerber_24h: 0,
        hinweis: 'Noch keine Meta-Bewerbungen — Funnel vermutlich noch nicht live',
      },
    };
  }

  // Check for recent meta candidates
  const { data: recentMeta } = await supabase
    .from('candidates')
    .select('id')
    .eq('agency_id', agencyId)
    .eq('source', 'meta')
    .gte('created_at', twentyFourHoursAgo.toISOString());

  if (!recentMeta?.length) {
    return {
      ergebnis: 'warnung',
      details: {
        meta_bewerber_24h: 0,
        hinweis: 'Funnel live, aber keine Meta-Bewerbungen in den letzten 24 Stunden — Pixel pruefen',
      },
    };
  }

  return {
    ergebnis: 'ok',
    details: {
      meta_bewerber_24h: recentMeta.length,
    },
  };
}

/**
 * Canary-Check: Placeholder — real canary needs external test submission.
 */
export async function checkCanary(
  _supabase: SupabaseClient,
  _agencyId: string,
): Promise<CheckResult> {
  return {
    ergebnis: 'ok',
    details: {
      hinweis: 'Canary-Check ist ein Platzhalter — externe Test-Bewerbung noch nicht implementiert',
    },
  };
}
