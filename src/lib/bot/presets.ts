// P3-R6: Presets als Code-Konstanten; Pflege durch Platform Admin per Code-Änderung (v1).

import type { BotQuestionType } from '@/lib/types/database';

// ---------------------------------------------------------------------------
// Öffentliche Typen
// ---------------------------------------------------------------------------

export interface BotPreset {
  key: 'pflege' | 'logistik' | 'handwerk' | 'gastro' | 'vertrieb';
  name: string;
  config: {
    persona: string;
    tone: string;
    formality: 'du' | 'sie';
    intro_text: string;
    faq: Array<{ q: string; a: string }>;
  };
  questions: Array<{
    key: string;
    text: string;
    type: BotQuestionType;
    options?: string[];
    required: boolean;
    knockout_rule?: Record<string, unknown>;
    weight: number;
  }>;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

export const BOT_PRESETS: BotPreset[] = [
  // -------------------------------------------------------------------------
  // Pflege
  // -------------------------------------------------------------------------
  {
    key: 'pflege',
    name: 'Pflege',
    config: {
      persona: 'freundliche Recruiting-Assistentin für Pflegestellen',
      tone: 'warm, wertschätzend, klar',
      formality: 'du',
      intro_text:
        'Hallo! Ich bin deine digitale Bewerbungsassistentin und helfe dir, den passenden Pflegejob zu finden. Ich stelle dir kurz ein paar Fragen, damit wir dich optimal vermitteln können.',
      faq: [
        {
          q: 'Welche Schichtmodelle gibt es?',
          a: 'Wir bieten Früh-, Spät- und Nachtschichten an — je nach Einrichtung auch Wunschdienstpläne.',
        },
        {
          q: 'Ist eine Einarbeitung vorgesehen?',
          a: 'Ja, jede neue Pflegekraft wird systematisch eingearbeitet und erhält einen festen Ansprechpartner.',
        },
        {
          q: 'Welche Vertragsarten werden angeboten?',
          a: 'Sowohl Vollzeit als auch Teilzeit — mit und ohne Befristung.',
        },
      ],
    },
    questions: [
      {
        key: 'ausbildung_pflege',
        text: 'Hast du eine abgeschlossene Ausbildung in der Pflege (z. B. Pflegefachkraft, Altenpflegerin, exam. Pflegerin)?',
        type: 'yes_no',
        required: true,
        knockout_rule: { equals: false },
        weight: 3,
      },
      {
        key: 'schichtmodell',
        text: 'Welche Schichten kannst du übernehmen?',
        type: 'choice',
        options: ['Frühschicht', 'Spätschicht', 'Nachtschicht', 'Alle Schichten'],
        required: true,
        weight: 2,
      },
      {
        key: 'erfahrung_jahre_pflege',
        text: 'Wie viele Jahre Berufserfahrung in der Pflege bringst du mit?',
        type: 'number',
        required: true,
        knockout_rule: { deduct_below: 1 },
        weight: 2,
      },
      {
        key: 'starttermin_pflege',
        text: 'Ab wann könntest du frühestens starten?',
        type: 'date',
        required: true,
        weight: 1,
      },
      {
        key: 'letzte_einrichtung',
        text: 'In welcher Art von Einrichtung hast du zuletzt gearbeitet (z. B. Krankenhaus, Pflegeheim, ambulante Pflege)?',
        type: 'text',
        required: false,
        weight: 1,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Logistik
  // -------------------------------------------------------------------------
  {
    key: 'logistik',
    name: 'Logistik',
    config: {
      persona: 'unkomplizierter Recruiting-Assistent für Logistikstellen',
      tone: 'direkt, freundlich, sachlich',
      formality: 'du',
      intro_text:
        'Hey! Ich bin dein Bewerbungsassistent für Logistikjobs. Kurze Fragen, schnelle Rückmeldung — lass uns loslegen!',
      faq: [
        {
          q: 'Wird der Staplerschein vor Ort erworben?',
          a: 'In Ausnahmefällen ja — sprich das bitte im Vorstellungsgespräch an.',
        },
        {
          q: 'Gibt es Schichtzulagen?',
          a: 'Ja, Nacht- und Wochenendschichten werden tariflich oder übertariflich vergütet.',
        },
      ],
    },
    questions: [
      {
        key: 'staplerschein',
        text: 'Hast du einen gültigen Staplerschein?',
        type: 'yes_no',
        required: true,
        knockout_rule: { equals: false },
        weight: 3,
      },
      {
        key: 'fuehrerschein_lkw',
        text: 'Hast du einen Führerschein der Klasse C/CE (LKW)?',
        type: 'yes_no',
        required: false,
        weight: 2,
      },
      {
        key: 'schicht_logistik',
        text: 'Welche Schichten sind für dich möglich?',
        type: 'choice',
        options: ['Frühschicht', 'Spätschicht', 'Nachtschicht', 'Wechselschicht', 'Keine Präferenz'],
        required: true,
        weight: 1,
      },
      {
        key: 'erfahrung_lager',
        text: 'Wie viele Jahre Lagererfahrung bringst du mit?',
        type: 'number',
        required: true,
        knockout_rule: { deduct_below: 1 },
        weight: 2,
      },
      {
        key: 'starttermin_logistik',
        text: 'Wann könntest du frühestens anfangen?',
        type: 'date',
        required: true,
        weight: 1,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Handwerk
  // -------------------------------------------------------------------------
  {
    key: 'handwerk',
    name: 'Handwerk',
    config: {
      persona: 'bodenständiger Recruiting-Assistent für Handwerksstellen',
      tone: 'klar, respektvoll, praktisch',
      formality: 'du',
      intro_text:
        'Moin! Ich helfe dir, den richtigen Handwerksbetrieb zu finden. Ich stelle dir ein paar kurze Fragen zu deiner Qualifikation.',
      faq: [
        {
          q: 'Sind Quereinsteiger willkommen?',
          a: 'Das hängt vom Betrieb ab — ohne Gesellenbrief gibt es in der Regel nur Helfer-Positionen.',
        },
        {
          q: 'Werden Reisekosten erstattet?',
          a: 'Die meisten unserer Partnerbetriebe erstatten Fahrtkosten — Details klärst du direkt im Gespräch.',
        },
      ],
    },
    questions: [
      {
        key: 'gesellenbrief',
        text: 'Hast du einen abgeschlossenen Gesellenbrief oder eine vergleichbare Berufsausbildung im Handwerk?',
        type: 'yes_no',
        required: true,
        knockout_rule: { equals: false },
        weight: 3,
      },
      {
        key: 'gewerk',
        text: 'In welchem Gewerk bist du ausgebildet (z. B. Elektro, Sanitär, Maler, Schreiner)?',
        type: 'text',
        required: true,
        weight: 2,
      },
      {
        key: 'fuehrerschein_handwerk',
        text: 'Hast du einen Führerschein Klasse B?',
        type: 'yes_no',
        required: false,
        weight: 1,
      },
      {
        key: 'erfahrung_jahre_handwerk',
        text: 'Wie viele Jahre Berufserfahrung im Handwerk hast du?',
        type: 'number',
        required: true,
        knockout_rule: { deduct_below: 1 },
        weight: 2,
      },
      {
        key: 'starttermin_handwerk',
        text: 'Ab wann kannst du frühestens starten?',
        type: 'date',
        required: true,
        weight: 1,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Gastro
  // -------------------------------------------------------------------------
  {
    key: 'gastro',
    name: 'Gastro',
    config: {
      persona: 'aufgeschlossene Recruiting-Assistentin für Gastro- und Servicestellen',
      tone: 'locker, herzlich, unkompliziert',
      formality: 'du',
      intro_text:
        'Hi! Ich bin deine Bewerbungsassistentin für Jobs in der Gastronomie. Ein paar kurze Fragen und ich bringe dich mit dem passenden Betrieb zusammen!',
      faq: [
        {
          q: 'Muss ich Erfahrung in der Gastronomie mitbringen?',
          a: 'Nicht zwingend — viele Betriebe stellen auch motivierte Quereinsteiger ein.',
        },
        {
          q: 'Werden Trinkgelder aufgeteilt?',
          a: 'Das regelt jeder Betrieb individuell — frag einfach direkt beim Vorstellungsgespräch nach.',
        },
      ],
    },
    questions: [
      {
        key: 'wochenende',
        text: 'Bist du bereit, auch am Wochenende zu arbeiten?',
        type: 'choice',
        options: ['Ja, gerne', 'Gelegentlich', 'Nein'],
        required: true,
        weight: 2,
      },
      {
        key: 'service_erfahrung',
        text: 'Hast du bereits Erfahrung im Service oder in der Küche?',
        type: 'yes_no',
        required: true,
        knockout_rule: { equals: false },
        weight: 3,
      },
      {
        key: 'sprachkenntnisse_gastro',
        text: 'Welche Fremdsprachen sprichst du (für den Gästekontakt)?',
        type: 'choice',
        options: ['Englisch', 'Spanisch', 'Französisch', 'Keine weiteren'],
        required: false,
        weight: 1,
      },
      {
        key: 'arbeitszeit_gastro',
        text: 'Suchst du eine Vollzeit- oder Teilzeitstelle?',
        type: 'choice',
        options: ['Vollzeit', 'Teilzeit'],
        required: true,
        weight: 1,
      },
      {
        key: 'starttermin_gastro',
        text: 'Wann könntest du frühestens beginnen?',
        type: 'date',
        required: true,
        weight: 1,
      },
    ],
  },

  // -------------------------------------------------------------------------
  // Vertrieb
  // -------------------------------------------------------------------------
  {
    key: 'vertrieb',
    name: 'Vertrieb',
    config: {
      persona: 'motivierender Recruiting-Assistent für Vertriebsstellen',
      tone: 'energetisch, direkt, positiv',
      formality: 'du',
      intro_text:
        'Hey! Ich bin dein Bewerbungsassistent für Vertriebsjobs. Ich stelle dir kurz ein paar Fragen, damit wir dir schnell das passende Angebot machen können.',
      faq: [
        {
          q: 'Welches Gehalt ist realistisch?',
          a: 'Vertriebsprofis verdienen bei uns zwischen 2.500 € und 6.000 € monatlich — je nach Leistung und Provision.',
        },
        {
          q: 'Brauche ich bereits Erfahrung im Außendienst?',
          a: 'Nicht unbedingt — wir schulen engagierte Einsteiger intensiv ein.',
        },
        {
          q: 'Gibt es einen Firmenwagen?',
          a: 'Ab einer bestimmten Stufe ja — das klären wir im persönlichen Gespräch.',
        },
      ],
    },
    questions: [
      {
        key: 'fuehrerschein',
        text: 'Hast du einen gültigen Führerschein Klasse B?',
        type: 'yes_no',
        required: true,
        knockout_rule: { equals: false },
        weight: 3,
      },
      {
        key: 'erfahrung_jahre',
        text: 'Wie viele Jahre Erfahrung im Vertrieb oder Außendienst bringst du mit?',
        type: 'number',
        required: true,
        knockout_rule: { deduct_below: 1 },
        weight: 2,
      },
      {
        key: 'starttermin',
        text: 'Ab wann wärst du startklar?',
        type: 'date',
        required: true,
        weight: 2,
      },
      {
        key: 'arbeitszeit',
        text: 'Suchst du eine Vollzeit- oder Teilzeitstelle im Vertrieb?',
        type: 'choice',
        options: ['Vollzeit', 'Teilzeit'],
        required: true,
        weight: 1,
      },
      {
        key: 'letzte_taetigkeit',
        text: 'Was war deine letzte berufliche Tätigkeit?',
        type: 'text',
        required: false,
        weight: 1,
      },
    ],
  },
];
