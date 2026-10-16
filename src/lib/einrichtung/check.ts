/**
 * Einrichtungs-Check für /admin/health: Welche Vercel-Variablen fehlen, welche Datenbank-Änderungen sind eingespielt?
 * Zeigt nur gesetzt/fehlt – nie Werte.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type Stufe = 'pflicht' | 'wichtig' | 'optional';

export interface EnvCheck {
  bereich: string;
  name: string;
  stufe: Stufe;
  wofuer: string;
}

export const ENV_CHECKS: EnvCheck[] = [
  { bereich: 'Grundlagen', name: 'SUPABASE_SERVICE_ROLE_KEY', stufe: 'pflicht', wofuer: 'Datenbank (Server)' },
  { bereich: 'Grundlagen', name: 'CRON_SECRET', stufe: 'pflicht', wofuer: 'Minuten-Cron, signierte Links, Masterclass-Sehnachweis' },
  { bereich: 'Grundlagen', name: 'ENCRYPTION_KEY', stufe: 'pflicht', wofuer: 'verschlüsselte Zugangsdaten (WhatsApp-Token)' },
  { bereich: 'Grundlagen', name: 'NEXT_PUBLIC_APP_URL', stufe: 'wichtig', wofuer: 'Links in Mails/WhatsApp, Twilio-Signatur' },
  { bereich: 'Sales', name: 'CLOSE_API_KEY', stufe: 'pflicht', wofuer: 'Close-Automatik, Sales-Übersicht' },
  { bereich: 'Sales', name: 'CALENDLY_API_KEY', stufe: 'wichtig', wofuer: 'Buchungen abgleichen' },
  { bereich: 'Sales', name: 'CALENDLY_WEBHOOK_SIGNING_KEY', stufe: 'wichtig', wofuer: 'Calendly-Webhook prüfen' },
  { bereich: 'Sales', name: 'SLACK_BOT_TOKEN', stufe: 'optional', wofuer: 'Slack-Meldungen (Deal-Feier, Alarme)' },
  { bereich: 'WhatsApp', name: 'META_APP_ID', stufe: 'pflicht', wofuer: 'Kunden verbinden WhatsApp (Embedded Signup)' },
  { bereich: 'WhatsApp', name: 'META_APP_SECRET', stufe: 'pflicht', wofuer: 'Meta-Webhook prüfen' },
  { bereich: 'WhatsApp', name: 'NEXT_PUBLIC_META_APP_ID', stufe: 'pflicht', wofuer: 'Embedded Signup im Browser' },
  { bereich: 'WhatsApp', name: 'NEXT_PUBLIC_META_ES_CONFIG_ID', stufe: 'pflicht', wofuer: 'Embedded-Signup-Konfiguration' },
  { bereich: 'Werbung', name: 'META_SYSTEM_USER_TOKEN', stufe: 'wichtig', wofuer: 'Werbekosten je Kunde/Stelle aus den Meta-Werbekonten (ads_read)' },
  { bereich: 'Leads', name: 'PERSPECTIVE_WEBHOOK_SECRET', stufe: 'wichtig', wofuer: 'Schutz vor gefälschten Leads – vorher ?secret= in allen Funnel-Webhooks eintragen' },
  { bereich: 'Leads', name: 'INDEED_WEBHOOK_SECRET', stufe: 'wichtig', wofuer: 'Indeed-Bewerbungen' },
  { bereich: 'Leads', name: 'RESEND_WEBHOOK_SECRET', stufe: 'optional', wofuer: 'nur für Indeed per E-Mail – nicht nötig, Indeed läuft über Manatal' },
  { bereich: 'E-Mail', name: 'RESEND_API_KEY', stufe: 'pflicht', wofuer: 'Einladungen, Berichte' },
  { bereich: 'KI', name: 'ANTHROPIC_API_KEY', stufe: 'pflicht', wofuer: 'Bot, Auswertungen' },
  { bereich: 'KI', name: 'OPENAI_API_KEY', stufe: 'wichtig', wofuer: 'Transkription (Sprachnachrichten, Aufnahmen)' },
  { bereich: 'Gespräche', name: 'FIREFLIES_API_KEY', stufe: 'wichtig', wofuer: 'Gesprächsanalyse' },
  { bereich: 'Gespräche', name: 'FIREFLIES_WEBHOOK_SECRET', stufe: 'optional', wofuer: 'Fireflies-Webhook prüfen' },
  { bereich: 'Telefonie', name: 'TWILIO_ACCOUNT_SID', stufe: 'wichtig', wofuer: 'Telefonieren im Browser' },
  { bereich: 'Telefonie', name: 'TWILIO_AUTH_TOKEN', stufe: 'wichtig', wofuer: 'Telefonieren im Browser' },
  { bereich: 'Telefonie', name: 'TWILIO_API_KEY_SID', stufe: 'wichtig', wofuer: 'Telefonieren im Browser' },
  { bereich: 'Telefonie', name: 'TWILIO_API_KEY_SECRET', stufe: 'wichtig', wofuer: 'Telefonieren im Browser' },
  { bereich: 'Telefonie', name: 'TWILIO_TWIML_APP_SID', stufe: 'wichtig', wofuer: 'Telefonieren im Browser' },
  { bereich: 'Bewerber', name: 'MANATAL_API_TOKEN', stufe: 'optional', wofuer: 'Manatal-Import' },
  { bereich: 'Buchhaltung', name: 'LEXOFFICE_API_KEY', stufe: 'wichtig', wofuer: 'Rechnungen' },
];

export interface DbCheck {
  name: string;
  datei: string;
  tabelle: string;
  spalten: string;
}

/** Je Migration ein Merkmal, das es erst danach gibt */
export const DB_CHECKS: DbCheck[] = [
  { name: 'Masterclass-Lektionen (Status, Kapitel)', datei: '20261005000001_masterclass_lektionen.sql', tabelle: 'masterclass_lessons', spalten: 'status, kapitel, anhaenge' },
  { name: 'Gesprächsanalyse: Ausgang', datei: '20261007000008_gespraech_ausgang.sql', tabelle: 'gespraech_analysen', spalten: 'ausgang, ausgang_am' },
  { name: 'Handelsregister / Firmendaten', datei: '20261014000390_handelsregister.sql', tabelle: 'onboarding_submissions', spalten: 'firmen_plz' },
  { name: 'Telefonie (Twilio)', datei: '20261014000400_twilio_telefonie.sql', tabelle: 'twilio_anrufe', spalten: 'id' },
  { name: 'Indeed-Kosten', datei: '20261014000410_indeed_kosten.sql', tabelle: 'indeed_kosten', spalten: 'id' },
  { name: 'Indeed-Budget', datei: '20261014000420_indeed_budget.sql', tabelle: 'indeed_budget', spalten: 'id' },
  { name: 'Kundengespräche (Fireflies)', datei: '20261014000430_kunden_gespraeche.sql', tabelle: 'kunden_gespraeche', spalten: 'id' },
  { name: 'Masterclass für Führungskräfte', datei: '20261015000440_masterclass_fuehrung.sql', tabelle: 'masterclass_freischaltungen', spalten: 'user_id' },
  { name: 'WhatsApp-Nummer besorgen (Twilio)', datei: '20261015000460_whatsapp_nummern.sql', tabelle: 'kunden_telefonnummern', spalten: '*' },
  { name: 'Zeiterfassung', datei: '20261016000480_zeiterfassung.sql', tabelle: 'zeiteintraege', spalten: 'id' },
  { name: 'Vorstellungsrunden / Termin-Format', datei: '20261016000490_vorstellungsrunden.sql', tabelle: 'vorstellungsrunden', spalten: 'id' },
  { name: 'Werbekosten je Stelle (Meta-Kampagnen, Indeed je Stelle)', datei: '20261016000500_kampagnen_kosten.sql', tabelle: 'meta_kampagnen_zuordnung', spalten: 'campaign_id, job_id' },
];

export interface Ergebnis {
  env: Array<EnvCheck & { gesetzt: boolean }>;
  db: Array<DbCheck & { ok: boolean }>;
}

export function pruefeEnv(env: Record<string, string | undefined> = process.env): Ergebnis['env'] {
  return ENV_CHECKS.map((c) => ({ ...c, gesetzt: !!env[c.name]?.trim() }));
}

export async function pruefeEinrichtung(svc: SupabaseClient): Promise<Ergebnis> {
  const db = await Promise.all(
    DB_CHECKS.map(async (c) => {
      const { error } = await svc.from(c.tabelle).select(c.spalten).limit(1);
      return { ...c, ok: !error };
    }),
  );
  return { env: pruefeEnv(), db };
}
