import { SupabaseClient } from '@supabase/supabase-js';

/**
 * The full D2D recruiting process definition.
 * Stored as JSONB in recruiting_pipeline_templates.definition_json
 */
const D2D_RECRUITING_DEFINITION = {
  ziele: {
    zeit_bis_erstkontakt_max_stunden: 2,
    zeit_bis_einstellung_max_tage: 14,
    show_rate_probetag_min: 0.7,
    einstellungsquote_min: 0.3,
  },
  quellen: ['meta_ads', 'indeed', 'empfehlung', 'initiativ'],
  vorqualifizierung: {
    pflichtfelder: ['name', 'telefon', 'standort', 'erfahrung', 'fuehrerschein'],
    disqualifikation: {
      kein_fuehrerschein: true,
      alter_unter_18: true,
      standort_zu_weit_km: 50,
    },
  },
  stufen: [
    {
      key: 'eingang',
      name: 'Bewerbungseingang',
      reihenfolge: 1,
      sla_minuten: 120,
      owner_rolle: 'system',
      gate_bedingung: null,
      assets: [
        { typ: 'vorlage', titel: 'Eingangsbestätigung SMS' },
        { typ: 'vorlage', titel: 'Eingangsbestätigung E-Mail' },
      ],
    },
    {
      key: 'erstkontakt',
      name: 'Erstkontakt',
      reihenfolge: 2,
      sla_stunden: 2,
      owner_rolle: 'ops',
      gate_bedingung: null,
      assets: [
        { typ: 'skript', titel: 'Telefonskript Erstkontakt' },
        { typ: 'checkliste', titel: 'Qualifizierungsfragen' },
      ],
    },
    {
      key: 'erstgespraech',
      name: 'Erstgespräch',
      reihenfolge: 3,
      sla_stunden: 48,
      owner_rolle: 'ops',
      gate_bedingung: null,
      assets: [
        { typ: 'skript', titel: 'Leitfaden Erstgespräch' },
        { typ: 'video', titel: 'Firmenpräsentation' },
      ],
    },
    {
      key: 'vorstellungsgespraech',
      name: 'Vorstellungsgespräch',
      reihenfolge: 4,
      sla_stunden: 72,
      owner_rolle: 'kunde',
      gate_bedingung: null,
      assets: [
        { typ: 'skript', titel: 'Interviewleitfaden für Kunden' },
        { typ: 'checkliste', titel: 'Bewertungsbogen' },
      ],
    },
    {
      key: 'probetag',
      name: 'Probetag',
      reihenfolge: 5,
      sla_stunden: 120,
      owner_rolle: 'kunde',
      gate_bedingung: null,
      assets: [
        { typ: 'checkliste', titel: 'Probetag-Ablaufplan' },
        { typ: 'vorlage', titel: 'Probetag-Feedbackbogen' },
      ],
    },
    {
      key: 'quali_woche',
      name: 'Qualifizierungswoche',
      reihenfolge: 6,
      sla_stunden: 168,
      owner_rolle: 'kunde',
      gate_bedingung: 'probetag_bestanden',
      assets: [
        { typ: 'checkliste', titel: 'Quali-Woche Bewertungskriterien' },
        { typ: 'vorlage', titel: 'Tagesbericht-Vorlage' },
      ],
    },
    {
      key: 'akademie',
      name: 'Akademie / Schulung',
      reihenfolge: 7,
      sla_stunden: 336,
      owner_rolle: 'kunde',
      gate_bedingung: 'akademie_abgeschlossen',
      assets: [
        { typ: 'video', titel: 'Schulungsmaterial' },
        { typ: 'checkliste', titel: 'Akademie-Abschlussprüfung' },
      ],
    },
    {
      key: 'onboarding',
      name: 'Onboarding / Einstellung',
      reihenfolge: 8,
      sla_stunden: null,
      owner_rolle: 'kunde',
      gate_bedingung: null,
      assets: [
        { typ: 'checkliste', titel: 'Onboarding-Checkliste' },
        { typ: 'vorlage', titel: 'Arbeitsvertrag-Vorlage' },
      ],
    },
  ],
  kennzahlen: {
    bewerbungen_monat: { ziel: 50, warnung: 30 },
    zeit_bis_erstkontakt_stunden: { ziel: 2, warnung: 4 },
    quote_erstgespraech: { ziel: 0.6, warnung: 0.4 },
    quote_vorstellungsgespraech: { ziel: 0.5, warnung: 0.3 },
    show_rate_probetag: { ziel: 0.7, warnung: 0.5 },
    quote_qualiwoche: { ziel: 0.6, warnung: 0.4 },
    einstellungen_monat: { ziel: 5, warnung: 2 },
    kosten_je_einstellung: { ziel: 500, warnung: 800 },
  },
  warnungen: [
    {
      key: 'erstkontakt_zu_langsam',
      bedingung: 'zeit_bis_erstkontakt_stunden > 4',
      nachricht: 'Durchschnittliche Erstkontaktzeit über 4 Stunden',
      schwere: 'warnung',
    },
    {
      key: 'wenig_bewerbungen',
      bedingung: 'bewerbungen_monat < 30',
      nachricht: 'Weniger als 30 Bewerbungen diesen Monat',
      schwere: 'warnung',
    },
    {
      key: 'niedrige_show_rate',
      bedingung: 'show_rate_probetag < 0.5',
      nachricht: 'Show-Rate Probetag unter 50%',
      schwere: 'kritisch',
    },
    {
      key: 'keine_einstellungen',
      bedingung: 'einstellungen_monat == 0',
      nachricht: 'Keine Einstellungen diesen Monat',
      schwere: 'kritisch',
    },
    {
      key: 'hohe_kosten',
      bedingung: 'kosten_je_einstellung > 800',
      nachricht: 'Kosten je Einstellung über 800€',
      schwere: 'warnung',
    },
  ],
  bindung: {
    check_in_nach_tagen: [7, 30, 90],
    feedback_nach_probetag: true,
    feedback_nach_quali_woche: true,
  },
  leistungsstandards: {
    min_vertraege_monat: 100,
    provision_je_einstellung: 750,
    garantie_tage: 90,
  },
};

/**
 * Seeds or updates the D2D recruiting template.
 * Uses upsert on the unique key to be idempotent.
 */
export async function seedRecruitingTemplate(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('recruiting_pipeline_templates')
    .upsert(
      {
        key: 'd2d_recruiting',
        name: 'D2D Recruiting Prozess',
        version: 1,
        aktiv: true,
        definition_json: D2D_RECRUITING_DEFINITION,
      },
      { onConflict: 'key' }
    )
    .select()
    .single();

  if (error) {
    throw new Error(`Fehler beim Seeden des Templates: ${error.message}`);
  }

  return data;
}

export { D2D_RECRUITING_DEFINITION };
