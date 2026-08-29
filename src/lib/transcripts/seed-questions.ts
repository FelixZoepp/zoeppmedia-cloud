import { SupabaseClient } from '@supabase/supabase-js';

const ONBOARDING_QUESTIONS = [
  { key: 'produkt', frage_text: 'Was genau verkauft ihr an der Tür, und für welchen Auftraggeber?', typ: 'onboarding', ziel_feld: 'agencies.produkt', pflicht: true, reihenfolge: 1, hinweis_fuer_csm: 'Produkt und Auftraggeber klären – z.B. PV, Glasfaser, Telko.' },
  { key: 'regionen', frage_text: 'In welchen Städten und Gebieten seid ihr unterwegs?', typ: 'onboarding', ziel_feld: 'agencies.regionen', pflicht: true, reihenfolge: 2, hinweis_fuer_csm: 'Alle Regionen erfassen, ggf. PLZ oder Bundesländer.' },
  { key: 'vertragsmodell', frage_text: 'Handelsvertreter oder Anstellung?', typ: 'onboarding', ziel_feld: 'client_profiles.anstellungsart', pflicht: true, reihenfolge: 3, hinweis_fuer_csm: 'Klar unterscheiden: HV §84 HGB vs. Arbeitsvertrag.' },
  { key: 'ausschlusskriterien', frage_text: 'Was sind die harten Ausschlusskriterien? Führerschein, Auto, Alter, Deutsch?', typ: 'onboarding', ziel_feld: 'client_profiles.fuehrerschein_noetig', pflicht: true, reihenfolge: 4, hinweis_fuer_csm: 'Alle K.O.-Kriterien auflisten – keine weichen Wünsche.' },
  { key: 'verguetung', frage_text: 'Wie ist die Vergütung aufgebaut?', typ: 'onboarding', ziel_feld: 'client_profiles.provisionsmodell', pflicht: true, reihenfolge: 5, hinweis_fuer_csm: 'Fixum + Provision, reine Provision, Garantie – genau aufschlüsseln.' },
  { key: 'verdienst', frage_text: 'Was verdient ein Neuer im zweiten Monat, was verdienen Top-Leute?', typ: 'onboarding', ziel_feld: 'client_profiles.verdienstspanne', pflicht: true, reihenfolge: 6, hinweis_fuer_csm: 'Realistische Spanne, nicht Marketing-Zahlen.' },
  { key: 'verdienst_beleg', frage_text: 'Woher kommt diese Zahl? Kannst du echte Abrechnungen zeigen?', typ: 'onboarding', ziel_feld: 'client_profiles.belegbare_zahlen', pflicht: true, reihenfolge: 7, hinweis_fuer_csm: 'Nachfragen ob Screenshots / Abrechnungen vorhanden sind.' },
  { key: 'gute_leute', frage_text: 'Wer funktioniert bei euch wirklich gut?', typ: 'onboarding', ziel_feld: 'client_profiles.alleinstellung', pflicht: false, reihenfolge: 8, hinweis_fuer_csm: 'Profil der erfolgreichen Mitarbeiter skizzieren.' },
  { key: 'schlechte_leute', frage_text: 'Wer geht regelmäßig schief?', typ: 'onboarding', ziel_feld: 'client_profiles.verbotene_claims', pflicht: false, reihenfolge: 9, hinweis_fuer_csm: 'Anti-Profil – wer passt definitiv nicht?' },
  { key: 'quereinsteiger', frage_text: 'Quereinsteiger oder nur Erfahrene?', typ: 'onboarding', ziel_feld: 'client_profiles.gesuchte_rolle', pflicht: true, reihenfolge: 10, hinweis_fuer_csm: 'Wichtig für Anzeigentext und Funnel.' },
  { key: 'einstiegsprozess', frage_text: 'Was passiert von Bewerbung bis erster Arbeitstag?', typ: 'onboarding', ziel_feld: null, pflicht: false, reihenfolge: 11, hinweis_fuer_csm: 'Gesamten Bewerbungsprozess dokumentieren.' },
  { key: 'probetag', frage_text: 'Wie läuft ein Probetag ab?', typ: 'onboarding', ziel_feld: null, pflicht: false, reihenfolge: 12, hinweis_fuer_csm: 'Ablauf, Dauer, Vergütung des Probetags.' },
  { key: 'karrierestufen', frage_text: 'Welche Aufstiegsstufen gibt es?', typ: 'onboarding', ziel_feld: 'client_profiles.karrierestufen', pflicht: true, reihenfolge: 13, hinweis_fuer_csm: 'Jede Stufe mit Titel und ungefährem Zeitrahmen.' },
  { key: 'usps', frage_text: 'Warum bleiben Leute bei euch?', typ: 'onboarding', ziel_feld: 'client_profiles.bleibegruende', pflicht: true, reihenfolge: 14, hinweis_fuer_csm: 'Echte Gründe, keine Marketing-Phrasen.' },
  { key: 'wettbewerber', frage_text: 'Mit wem konkurriert ihr um Leute?', typ: 'onboarding', ziel_feld: null, pflicht: false, reihenfolge: 15, hinweis_fuer_csm: 'Direkte Wettbewerber in der Region identifizieren.' },
  { key: 'tonalitaet', frage_text: 'Wie redet ihr — locker oder seriös?', typ: 'onboarding', ziel_feld: 'client_profiles.tonalitaet', pflicht: true, reihenfolge: 16, hinweis_fuer_csm: 'Du/Sie, Jugendsprache ja/nein, Emoji-Level.' },
  { key: 'ansprechpartner', frage_text: 'Wer ruft die Bewerber an, mit Name und Handynummer?', typ: 'onboarding', ziel_feld: null, pflicht: true, reihenfolge: 17, hinweis_fuer_csm: 'Name + Durchwahl – muss im System hinterlegt werden.' },
  { key: 'sla_erstkontakt', frage_text: 'Wie schnell schafft ihr den Erstkontakt realistisch?', typ: 'onboarding', ziel_feld: null, pflicht: true, reihenfolge: 18, hinweis_fuer_csm: 'In Minuten/Stunden – nicht "so schnell wie möglich".' },
  { key: 'vertretung', frage_text: 'Was passiert, wenn diese Person im Urlaub ist?', typ: 'onboarding', ziel_feld: null, pflicht: false, reihenfolge: 19, hinweis_fuer_csm: 'Vertretungsregelung klären.' },
  { key: 'zusagen', frage_text: 'Was wurde im Gespräch zugesagt?', typ: 'onboarding', ziel_feld: null, pflicht: true, reihenfolge: 20, hinweis_fuer_csm: 'Alle Zusagen aus dem Vertriebsgespräch festhalten.' },
];

/**
 * Seeds the transcript_questions table with the onboarding question catalog.
 * Uses upsert on the `key` field so it can be re-run safely.
 */
export async function seedOnboardingQuestions(supabase: SupabaseClient): Promise<{ inserted: number; errors: string[] }> {
  const errors: string[] = [];
  let inserted = 0;

  for (const q of ONBOARDING_QUESTIONS) {
    const { error } = await supabase
      .from('transcript_questions')
      .upsert(
        {
          key: q.key,
          frage_text: q.frage_text,
          typ: q.typ,
          ziel_feld: q.ziel_feld,
          pflicht: q.pflicht,
          reihenfolge: q.reihenfolge,
          hinweis_fuer_csm: q.hinweis_fuer_csm,
          aktiv: true,
        },
        { onConflict: 'key' }
      );

    if (error) {
      errors.push(`${q.key}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  return { inserted, errors };
}

export { ONBOARDING_QUESTIONS };
