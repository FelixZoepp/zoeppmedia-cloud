/**
 * Leadquelle: Jeder Lead in Close soll eine haben.
 * Funnel-Leads (UTM-Daten oder Funnel-Fragen ausgefüllt) bekommen sie automatisch aus den UTM-Werten,
 * von Hand angelegte Leads bekommen keine „Jetzt anrufen“-Aufgabe, aber eine Erinnerung, die Quelle einzutragen.
 */

export const LEADQUELLE_CF = 'cf_QiH8TTQXCkFg846D3N4qPF6STvbww7q3WJAK3Qja0n8';
export const UTM_CF = {
  source: 'cf_HDeEGCeYwUNaYFw1HEYlndsGXBJ8fqcssd1shBPy8xJ',
  medium: 'cf_YHPoQshsVKzMo15WXQPFdFGBwza89ZQjsLMXz4vgOwE',
  campaign: 'cf_bU6J8BIIfE4QDGFDhQX3KWl97Gxil41hjmBFytJfpCl',
  content: 'cf_mCdWHLOQT8lnsH9uQokTM0DdbVkR1IuD3uUJhwyAs4z',
} as const;
export const DATUM_EINTRAGUNG_CF = 'cf_WMbNB0RJaXjjklD1KZB4abAcYAByWk4LY5JKu4IcvTq';
/** Fragen aus den Funnels – sind sie ausgefüllt, kam der Lead über ein Formular */
export const FUNNEL_FRAGEN_CF = [
  'cf_LfyzR27zU8qy65j9ig3s4evrutshXzFyEfKkC32sDEO', // Was ist aktuell dein größtes Problem?
  'cf_xyEcxz9c5xP4dazuWv0wK4LKDXVmcWtFPloRltVcECa', // Wie gewinnst du aktuell Vertriebler?
  'cf_tXeSCVGaJ7nsM5CMDsdqT4RGTmOh5Zi2iYI6EUI9hMs', // Wie lange bleibt ein Vertriebler …
  'cf_ZF4DTHIl21wD2JsX0EsTgJAirKaEJ6mYMO139HjQNZd', // Wie viel gute Vertriebler stellst du monatlich ein?
  'cf_ZqGjHHi76NWdxhTqpRmeGjYYA5gT81mF6XgMmxzW1su', // Wie viele Vertriebler möchtest du … einstellen?
  'cf_AzI27vdkmpyYEqu39jSGumuGAyIecGZRiDfPzbC6R1V', // Was beschreibt dich am Besten?
  'cf_iZrHDfTtiWqFZQOf2pTAYxH0wgxPcHazeQ254rrHHhe', // Wie gewinnst du aktuell Kunden?
  'cf_oF201Zeip7cCCy5rDaHFJKaGtOMoTkWgo5SsjXSBEmG', // Wie hoch ist dein durchschnittlicher Kundenwert?
  'cf_xBzDBQDFwk3fpdAQd5degHCm6KFu7SF9SexQsMgpARE', // Aktuelle Anfragenquelle
];

/** Alle Felder, die für Quelle/Funnel-Erkennung geladen werden */
export const QUELLEN_FELDER = [LEADQUELLE_CF, ...Object.values(UTM_CF), DATUM_EINTRAGUNG_CF, ...FUNNEL_FRAGEN_CF];

export interface LeadFelder {
  leadquelle: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  datumEintragung: string | null;
  funnelFragen: boolean;
}

const text = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** Felder aus einer Close-Lead-Antwort (Schlüssel `custom.cf_…`) lesen */
export function leseLeadFelder(l: Record<string, unknown>): LeadFelder {
  const f = (id: string) => text(l[`custom.${id}`]);
  return {
    leadquelle: f(LEADQUELLE_CF),
    utmSource: f(UTM_CF.source),
    utmMedium: f(UTM_CF.medium),
    utmCampaign: f(UTM_CF.campaign),
    datumEintragung: f(DATUM_EINTRAGUNG_CF),
    funnelFragen: FUNNEL_FRAGEN_CF.some((id) => f(id) !== null),
  };
}

/** Kam der Lead über einen Funnel/ein Formular? Sonst wurde er von Hand angelegt. */
export function istFunnelLead(f: LeadFelder): boolean {
  return !!(f.utmSource || f.utmMedium || f.utmCampaign || f.datumEintragung || f.funnelFragen);
}

const PLATTFORM: Record<string, string> = {
  ig: 'Instagram',
  instagram: 'Instagram',
  fb: 'Facebook',
  facebook: 'Facebook',
  an: 'Meta Audience Network',
  msg: 'Messenger',
  th: 'Threads',
  google: 'Google',
  youtube: 'YouTube',
  yt: 'YouTube',
  linkedin: 'LinkedIn',
  li: 'LinkedIn',
  tiktok: 'TikTok',
  email: 'E-Mail',
  newsletter: 'Newsletter',
};
const META = new Set(['Instagram', 'Facebook', 'Meta Audience Network', 'Messenger', 'Threads']);

/** Leadquelle aus den UTM-Werten ableiten, z. B. ig + paid → „Meta Ads – Instagram“ */
export function leadquelleAusUtm(f: Pick<LeadFelder, 'utmSource' | 'utmMedium' | 'utmCampaign'>): string | null {
  const src = f.utmSource?.toLowerCase() ?? '';
  const med = f.utmMedium?.toLowerCase() ?? '';
  const bezahlt = /^(paid|cpc|ppc|ads?|paid_social|paidsocial|cpm)$/.test(med) || /^\d{6,}$/.test(f.utmCampaign ?? '');
  const plattform = PLATTFORM[src] ?? (f.utmSource ? f.utmSource : null);
  if (plattform && META.has(plattform)) return bezahlt || !med ? `Meta Ads – ${plattform}` : `${plattform} (organisch)`;
  if (plattform) return bezahlt ? `${plattform} Ads` : med ? `${plattform} (${f.utmMedium})` : plattform;
  if (bezahlt) return 'Meta Ads';
  return null;
}

/** Quelle für einen Funnel-Lead ohne eingetragene Leadquelle */
export function automatischeLeadquelle(f: LeadFelder): string | null {
  if (f.leadquelle) return null;
  if (!istFunnelLead(f)) return null;
  return leadquelleAusUtm(f) ?? 'Funnel (ohne UTM)';
}
