/**
 * Ablauf-Schritt (catalog.ts) → SOP-Slug der Akademie. Klein gehalten, damit Client-Komponenten
 * „SOP ansehen“ anzeigen können, ohne alle Inhalte ins Bundle zu laden.
 * Ein Test prüft, dass diese Liste zu START_ARTIKEL passt.
 */
export const SCHRITT_SOP: Record<string, string> = {
  z_vertrag: 'after-close',
  z_rechnung_setup: 'setup-rechnung',
  z_zahlung_setup: 'setup-rechnung',
  o_kickoff_gebucht: 'kickoff',
  o_kickoff: 'kickoff',
  o_transkript: 'kickoff',
  o_cloud_login: 'onboarding-kunde',
  o_inhaltsfunnel: 'onboarding-kunde',
  o_bilder: 'onboarding-kunde',
  o_whatsapp: 'onboarding-kunde',
  o_meta_seite: 'meta-zugaenge',
  o_meta_instagram: 'meta-zugaenge',
  o_meta_werbekonto: 'meta-zugaenge',
  o_meta_pixel: 'meta-zugaenge',
  o_meta_domain: 'meta-zugaenge',
  o_meta_zahlung: 'meta-zugaenge',
  o_zugaenge_geprueft: 'meta-zugaenge',
  o_systemnutzer: 'meta-zugaenge',
  o_indeed: 'indeed-zugang',
  s_indeed_anzeige: 'indeed-zugang',
  s_ideen: 'ads-werkstatt',
  s_grafiken: 'ads-werkstatt',
  s_ads_vorbereitet: 'ads-werkstatt',
  s_freigabe: 'freigabe-kunde',
  s_funnel: 'funnel',
  s_funnel_tracking: 'funnel',
  s_testlead: 'test-lead',
  s_werbemanager: 'meta-kampagne',
  s_launch: 'meta-kampagne',
  s_starttermin: 'starttermin',
  s_innendienst: 'starttermin',
  c_check_7: 'continuity-check',
  c_check_14: 'continuity-check',
  c_check_30: 'continuity-check',
  c_check_45: 'continuity-check',
  c_check_60: 'continuity-check',
  c_check_75: 'continuity-check',
  c_testimonial_termin: 'testimonial-verlaengerung',
  c_testimonial: 'testimonial-verlaengerung',
  c_check_90: 'testimonial-verlaengerung',
  off_kuendigung: 'offboarding',
  off_kampagnen: 'offboarding',
  off_zugaenge: 'offboarding',
  off_report: 'offboarding',
  off_testimonial: 'offboarding',
  off_cloud: 'offboarding',
};

export function hatSop(stepKey: string | null | undefined): boolean {
  return !!stepKey && stepKey in SCHRITT_SOP;
}
