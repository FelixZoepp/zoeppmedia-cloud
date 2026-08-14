/**
 * D2D Recruiting Template Database
 *
 * All templates use {{placeholder}} syntax for variable replacement.
 * Conditional blocks: {{#wenn field=value}}...{{/wenn}}
 */

import type { OnboardingContext } from './claude';

// ============================================================
// Label maps for human-readable replacements
// ============================================================

const productLabels: Record<string, string> = {
  pv: 'Photovoltaik / Solaranlagen',
  glasfaser: 'Glasfaser-Internet',
  strom_gas: 'Strom- und Gas-Tarife',
  telko: 'Telekommunikation',
  versicherung: 'Versicherung',
};

const taskTypeLabels: Record<string, string> = {
  leads_only: 'Nur Leads erfassen (kein Verkauf)',
  contract_close: 'Vertragsabschluss vor Ort',
};

const compensationLabels: Record<string, string> = {
  pure_commission: 'Reine Provision',
  commission_guarantee: 'Provision + Garantiegehalt',
  fixed_commission: 'Fixum + Provision',
};

const employmentLabels: Record<string, string> = {
  self_employed: 'Selbstständig (§84 HGB)',
  employed: 'Angestellt',
};

const trainingLabels: Record<string, string> = {
  one_on_one: '1:1 Einarbeitung',
  video_course: 'Videokurs',
  mentor: 'Mentor-Programm',
  learning_by_doing: 'Learning by doing',
};

const careerLevelLabels: Record<string, string> = {
  vertriebler: 'Vertriebler',
  ausbilder: 'Ausbilder',
  teamleiter: 'Teamleiter',
  standortleiter: 'Standortleiter',
};

const extrasLabels: Record<string, string> = {
  gutscheine: 'Gutscheine',
  events: 'Events',
  coachings: 'Coachings',
  ausruestung: 'Ausrüstung',
  tankkarte: 'Tankkarte',
};

function lbl(map: Record<string, string>, key: string | null | undefined): string {
  if (!key) return 'k.A.';
  return map[key] || key;
}

function lblArr(map: Record<string, string>, keys: string[] | null | undefined): string {
  if (!keys || keys.length === 0) return 'k.A.';
  return keys.map((k) => map[k] || k).join(', ');
}

// ============================================================
// GENERATOR RULES
// ============================================================

export const GENERATOR_RULES = `HARTE REGELN FÜR ALLE GENERIERTEN INHALTE:

1. TONALITÄT: Immer die vorgegebene Ansprache (Du oder Sie) durchgehend verwenden. Kein Wechsel.
2. VERDIENSTANGABEN: Nur den angegebenen Verdienstbereich nennen. Niemals "bis zu" ohne Untergrenze. Niemals unrealistische Zahlen.
3. QUEREINSTEIGER: Wenn keine Erfahrung nötig, aktiv betonen dass KEINE Erfahrung nötig ist. "Quereinsteiger willkommen" in jeder Anzeige. Wenn Erfahrung nötig, als Anforderung klar benennen aber nicht abschreckend.
4. AUFGABENTYP: Bei "Nur Leads" NIEMALS "Verkauf" oder "Abschluss" schreiben. Es geht NUR um Leads/Termine erfassen. Bei "Vertragsabschluss" klar benennen — das zieht Vertriebler an.
5. KUNDENNAME: Wenn nennbar, namentlich nennen. Wenn nicht, NIEMALS namentlich nennen — stattdessen "namhafter Auftraggeber".
6. EMOJIS: In Anzeigen und Funnels erlaubt. In Skripten und Leitfäden KEINE Emojis.
7. REGION: Immer das Einsatzgebiet nennen.
8. FÜHRERSCHEIN: Wenn Pflicht, klar als Voraussetzung nennen. Wenn nicht Pflicht, nicht als Muss-Kriterium.
9. STARTDATUM: Wenn vorhanden, als frühesten Start nennen.
10. KEINE FLOSKELN: Kein "dynamisches Team", kein "flache Hierarchien", kein "attraktives Gehalt". Stattdessen konkrete Zahlen und Fakten.`;

// ============================================================
// AD TEMPLATES — 3 Angles
// ============================================================

export const AD_TEMPLATE_WINKEL_1 = `WINKEL 1 — GELD / VERDIENST
Zielemotion: Gier, Neid, FOMO
Hook-Pattern: Konkreter Verdienst + Unglaube

Erzeuge 4 Varianten dieses Winkels. Jede Variante braucht:
- HOOK (max 125 Zeichen): Konkreter Verdienst als Eye-Catcher
- PRIMARY TEXT (max 250 Zeichen): Stelle + Verdienst + Aufgabe + CTA
- HEADLINE (max 40 Zeichen): Verdienst + Jobtitel
- CTA: "Jetzt bewerben"

Beispiel-Hook: "{{monthly_earning_from}}–{{monthly_earning_to}} EUR/Monat als {{job_title}} in {{regions}} — {{experience_text}}? So geht's:"

Pflichtinhalte pro Variante:
- Realistischer Verdienst: {{earning_range}}
- Vergütungsmodell: {{compensation_label}}
{{task_type_rule}}
{{experience_rule}}
- Konkreten CTA mit [LINK]
{{client_rule}}`;

export const AD_TEMPLATE_WINKEL_2 = `WINKEL 2 — FREIHEIT / LIFESTYLE
Zielemotion: Autonomie, Unabhängigkeit, Selbstbestimmung
Hook-Pattern: Kontrastieren mit 9-to-5 / Chef-Abhängigkeit

Erzeuge 3 Varianten dieses Winkels. Jede Variante braucht:
- HOOK (max 125 Zeichen): Freiheits-Kontrast zum Bürojob
- PRIMARY TEXT (max 250 Zeichen): Freiheit + Verdienst + Einstieg
- HEADLINE (max 40 Zeichen): Freiheits-Statement
- CTA: "Jetzt starten"

Beispiel-Hook: "Kein Büro. Kein Chef im Nacken. Kein Deckel auf dem Gehalt."

Pflichtinhalte pro Variante:
- Verdienst: {{earning_range}}
- Selbstbestimmung betonen (Arbeitszeit, Verdienst, Karriere)
- Anstellungsart: {{employment_label}}
{{task_type_rule}}
{{experience_rule}}
- CTA mit [LINK]`;

export const AD_TEMPLATE_WINKEL_3 = `WINKEL 3 — KARRIERE / AUFSTIEG
Zielemotion: Ehrgeiz, Anerkennung, Status
Hook-Pattern: Karrierestufen als konkreter Aufstiegsplan

Erzeuge 3 Varianten dieses Winkels. Jede Variante braucht:
- HOOK (max 125 Zeichen): Karriereweg als Versprechen
- PRIMARY TEXT (max 250 Zeichen): Karrierestufen + Verdienst + Einstieg
- HEADLINE (max 40 Zeichen): Karriere-Statement
- CTA: "Aufsteigen starten"

Beispiel-Hook: "Vom {{job_title}} zum {{top_career_level}} — kein Studium nötig. Nur Leistung zählt."

Pflichtinhalte pro Variante:
- Karrierestufen: {{career_levels_label}}
{{company_car_rule}}
- Verdienst: {{earning_range}}
{{experience_rule}}
- CTA mit [LINK]`;

// ============================================================
// FUNNEL TEMPLATE — 7 Screens
// ============================================================

export const FUNNEL_TEMPLATE = `PERSPECTIVE FUNNEL — 7 SCREENS

Erstelle Texte für einen Perspective Recruiting-Funnel (Mobile Landing Page).

SCREEN 1 — STARTSEITE:
- Headline: "{{job_title}} in {{regions}} — {{earning_range}} verdienen"
- Subline: {{task_type_description}}
{{experience_subline}}
- CTA-Button: "Jetzt in 60 Sekunden bewerben"

SCREEN 2 — QUALIFIZIERUNG 1 (Erfahrung):
- Frage: "{{haben}} bereits Vertriebserfahrung?"
- Antwort A: "Ja, im Außendienst"
- Antwort B: "Ja, aber nicht im D2D"
- Antwort C: "Nein, bin Quereinsteiger"
(Alle Antworten führen weiter — keine Disqualifizierung!)

SCREEN 3 — QUALIFIZIERUNG 2 (Führerschein/Mobilität):
{{driving_question}}

SCREEN 4 — QUALIFIZIERUNG 3 (Startdatum):
- Frage: "Wann {{koennen}} starten?"
- Antwort A: "Sofort{{start_date_suffix}}"
- Antwort B: "In 2–4 Wochen"
- Antwort C: "In 1–2 Monaten"

SCREEN 5 — BENEFITS / PROOF:
- Headline: "Das erwartet {{dich}}"
- Verdienst: {{earning_range}} ({{compensation_label}})
- Ausbildung: {{training_label}} — vom ersten Tag an begleitet
- Karrierestufen: {{career_levels_label}}
{{company_car_benefit}}
{{client_benefit}}
{{extras_benefit}}
- CTA: "Fast geschafft — jetzt Daten eingeben"

SCREEN 6 — KONTAKTDATEN:
- Headline: "Noch 30 Sekunden — {{possessiv}} Bewerbung"
- Felder: Vorname, Nachname, Telefon, E-Mail
- Hinweis: "Wir melden uns innerhalb von 24h."
- CTA: "Bewerbung absenden"

SCREEN 7 — DANKE:
- Headline: "Bewerbung erhalten!"
- Text: "Wir melden uns innerhalb von 24 Stunden. {{contact_line}}"

Tonalität: Conversion-optimiert, {{tone_label}}-Ansprache, mit Emojis. Jeder Screen maximal 2-3 kurze Sätze.`;

// ============================================================
// PHONE SCRIPT
// ============================================================

export const PHONE_SCRIPT_TEMPLATE = `TELEFON-SKRIPT: VORQUALIFIZIERUNG

Anrufer: {{contact_name}}
Firma: {{company_name}}
Stelle: {{job_title}}
Produkt: {{product_label}}

=== 1. BEGRÜßUNG ===
"{{gruss}} [Bewerbername], hier ist {{contact_name}} von {{company_name}}. {{Du_hast}} bei uns auf die Stelle als {{job_title}} beworben — ich rufe kurz an wegen {{deiner}} Bewerbung. Passt es gerade?"

=== 2. BEZUG HERSTELLEN ===
"Super! {{Du_hast}} über [Quelle] beworben. Kurz zu uns: Wir suchen {{job_title}} in {{regions}} für {{product_label}}. {{task_type_pitch}}"

=== 3. QUALIFIZIERUNGSFRAGEN ===

Frage 1 — Erfahrung:
{{experience_question}}

Frage 2 — Mobilität:
{{mobility_question}}

Frage 3 — Startdatum:
"Wann {{koenntest}} denn starten? Wir suchen ab {{start_date}}."

=== 4. VERDIENST-TEASER ===
"Kurz zum Verdienst: {{compensation_label}}, {{commission_per_unit}}. Realistisch sind {{earning_range}} im Monat nach Einarbeitung. {{company_car_line}}"

=== 5. TERMIN VEREINBAREN ===
"Das klingt alles super. Lass uns ein kurzes Vorstellungsgespräch machen — wann passt es {{dir}} diese Woche? Dauert ca. 20 Minuten."

=== 6. EINWANDBEHANDLUNG ===

"Kein Interesse mehr":
→ "Verstehe ich. Darf ich fragen, was sich geändert hat? [Pause] Viele unserer besten Leute waren anfangs skeptisch. Der Verdienst von {{earning_range}}/Monat hat sie überzeugt."

"Keine Zeit gerade":
→ "Kein Problem! Wann passt es {{dir}} besser? Ich rufe nochmal an. [Konkreten Termin vereinbaren]"

"Muss überlegen":
→ "Absolut verständlich. Ich melde mich morgen nochmal — dann {{kannst}} in Ruhe entscheiden."

"Klingt nach Drückerei":
→ {{drueckerei_response}}

=== 7. VERABSCHIEDUNG ===
"Perfekt, dann sehen wir uns am [Datum/Uhrzeit]. Ich schicke {{dir}} gleich eine Bestätigung. Bis dann!"

WICHTIG: Natürlich sprechen, nicht ablesen. Pausen lassen nach Fragen. Bei Absage freundlich bleiben.`;

// ============================================================
// VG-LEITFADEN
// ============================================================

export const VG_LEITFADEN_TEMPLATE = `VORSTELLUNGSGESPRÄCH-LEITFADEN

Firma: {{company_name}}
Stelle: {{job_title}}
Produkt: {{product_label}}
Dauer: 20–30 Minuten

=== PHASE 1: WARM-UP (3 Min.) ===
- Smalltalk: Anreise, Wetter, allgemeine Stimmung
- "Schön, dass {{du}} da {{bist}}. Ich bin {{contact_name}} von {{company_name}}."
- "Wie {{bist}} auf uns aufmerksam geworden?"

=== PHASE 2: FIRMA VORSTELLEN (5 Min.) ===
- Was macht {{company_name}}? → {{product_label}}, D2D-Vertrieb
{{client_pitch}}
- Einsatzgebiete: {{regions}}
- "Wir sind kein Callcenter — {{du}} {{bist}} draußen unterwegs, {{triffst}} echte Menschen."

=== PHASE 3: BEWERBER KENNENLERNEN (10 Min.) ===
1. "Erzähl kurz {{deinen}} bisherigen Werdegang."
2. "Was hat {{dich}} an unserer Stelle angesprochen?"
3. {{experience_vg_question}}
4. "Was ist {{dir}} bei einem Job am wichtigsten?"
5. "Wo {{moechtest}} in einem Jahr stehen?"

Rote Flaggen:
- Fragt nur nach Gehalt ohne Interesse an der Tätigkeit
- Kann nicht erklären warum D2D
- Will nur Homeoffice

=== PHASE 4: STELLE ERKLÄREN (5 Min.) ===
Der typische Tag:
{{typical_day}}

Karriere: {{career_levels_label}}
{{company_car_line}}

Verdienst: {{compensation_label}}, {{commission_per_unit}}. Realistisch {{earning_range}}/Monat.

=== PHASE 5: FRAGEN BEANTWORTEN (3 Min.) ===
"{{Hast}} noch Fragen?"

Häufige Fragen:
- "Was muss ich mitbringen?" → {{requirement_answer}}
- "Wie sieht die Einarbeitung aus?" → {{training_label}}
- "Ist das Selbstständigkeit?" → {{employment_answer}}

=== PHASE 6: ABSCHLUSS (2 Min.) ===
Wenn positiv:
"Das passt gut. Mein Vorschlag: {{du_kommst}} [Datum] zum Probetag. Da {{kannst}} das Team und die Arbeit live anschauen."

Wenn unsicher:
"Ich melde mich morgen mit einer Rückmeldung."

Wenn Absage:
"Danke für {{deine}} Zeit. Falls sich etwas ändert, melde {{dich}} gerne wieder."`;

// ============================================================
// FOLLOW-UP TEMPLATES
// ============================================================

export const FOLLOW_UP_TEMPLATES = {
  nach_vq: `FOLLOW-UP NACH VORQUALIFIZIERUNG (24h)
Kanal: WhatsApp / SMS

VARIANTE 1 — TERMIN BESTÄTIGUNG:
"{{gruss}} [Name], hier ist {{contact_name}} von {{company_name}}. Wir hatten telefoniert wegen der Stelle als {{job_title}}.
Erinnerung: {{dein}} Vorstellungsgespräch ist am [Datum] um [Uhrzeit]. Bis dann!"

VARIANTE 2 — KEIN TERMIN:
"{{gruss}} [Name], hier nochmal {{contact_name}} von {{company_name}}.
Die Stelle als {{job_title}} in {{regions}} ist noch offen — {{earning_range}}/Monat{{experience_short}}.
Soll ich {{dir}} einen Termin für ein 20-minütiges Gespräch vorschlagen?"

VARIANTE 3 — NICHT ERREICHT:
"{{gruss}} [Name], ich hatte versucht {{dich}} zu erreichen. {{contact_name}} von {{company_name}} — wegen {{deiner}} Bewerbung als {{job_title}}.
Wann passt es {{dir}} am besten?"`,

  nach_vg: `FOLLOW-UP NACH VORSTELLUNGSGESPRÄCH (48h)
Kanal: WhatsApp / Telefon

POSITIV — PROBETAG EINLADEN:
"{{gruss}} [Name], hier ist {{contact_name}}. Danke nochmal für das Gespräch!
Ich möchte {{dich}} zum Probetag einladen.
Termin: [Datum], [Uhrzeit] | Ort: [Ort]
{{du_faehrst}} mit einem erfahrenen Kollegen mit — kein Druck, einfach reinschnuppern. Passt das?"

NOCH UNSICHER:
"{{gruss}} [Name], Gibt es noch offene Fragen nach unserem Gespräch?
Vorschlag: Komm zum unverbindlichen Probetag am [Datum]. Ganz ohne Verpflichtung."`,

  nach_probetag: `FOLLOW-UP NACH PROBETAG
Kanal: Telefon → WhatsApp

POSITIV — EINSTELLEN:
"{{gruss}} [Name]! Wie war {{dein}} Eindruck vom Probetag?
Von unserer Seite: Das Team fand {{dich}} super. Wir würden {{dich}} gerne einstellen.
Nächste Schritte: Vertrag ({{employment_label}}), Start [Datum], Einarbeitung {{training_label}}.
{{bist_du}} dabei?"

NOCH UNSICHER:
"Danke für den Probetag! Die nächste Einarbeitungsrunde startet am [Datum].
Keine Eile — aber damit {{du}} es im Hinterkopf {{hast}}."`,
};

// ============================================================
// ABSAGE TEMPLATES
// ============================================================

export const ABSAGE_TEMPLATES = {
  telefon: `ABSAGE TELEFONISCH:
"{{gruss}} [Name], hier ist {{contact_name}} von {{company_name}}.
Ich melde mich wegen {{deiner}} Bewerbung als {{job_title}}. Leider müssen wir {{dir}} mitteilen, dass wir uns für einen anderen Kandidaten entschieden haben.
Das liegt nicht an {{dir}} persönlich — wir hatten viele gute Bewerbungen.
{{du_darfst}} sich gerne in Zukunft wieder bewerben. Alles Gute!"`,

  nach_vg: `ABSAGE NACH VG:
Telefon: "{{gruss}} [Name], danke nochmal für das Gespräch. Leider müssen wir {{dir}} absagen — wir haben uns für jemanden entschieden, der etwas besser passt. Falls in Zukunft etwas frei wird, melde ich mich gerne."

Nachricht (falls nicht erreichbar):
"{{gruss}} [Name], hier {{contact_name}} von {{company_name}}. Leider müssen wir {{dir}} mitteilen, dass wir uns für einen anderen Kandidaten entschieden haben. Das lag nicht an {{dir}}. Falls sich etwas ergibt, melden wir uns. Alles Gute!"`,

  schriftlich: `ABSAGE SCHRIFTLICH (E-Mail):
Betreff: {{deine_cap}} Bewerbung bei {{company_name}}

{{gruss}} [Name],

vielen Dank für {{deine}} Bewerbung als {{job_title}} und {{dein}} Interesse an {{company_name}}.

Nach sorgfältiger Prüfung müssen wir {{dir}} leider mitteilen, dass wir uns für einen anderen Kandidaten entschieden haben. Dies ist keine Bewertung {{deiner}} Qualifikationen.

Wir wünschen {{dir}} alles Gute!

Mit freundlichen Grüßen
{{contact_name}}
{{company_name}}

WHATSAPP (kurz):
"{{gruss}} [Name], hier {{contact_name}} von {{company_name}}. Danke für {{deine}} Bewerbung! Leider haben wir uns für jemand anderen entschieden. Alles Gute!"`,
};

// ============================================================
// BRANCH DEFAULTS
// ============================================================

export interface BranchDefault {
  product_label: string;
  typical_commission: string;
  typical_earning_from: number;
  typical_earning_to: number;
  typical_task_type: string;
  typical_pitch: string;
  hook_keywords: string[];
  strongest_angle: string;
  objection_handling: Record<string, string>;
}

export const BRANCH_DEFAULTS: Record<string, BranchDefault> = {
  solar: {
    product_label: 'Photovoltaik / Solaranlagen',
    typical_commission: '200–400 EUR pro Termin/Lead',
    typical_earning_from: 3500,
    typical_earning_to: 7000,
    typical_task_type: 'leads_only',
    typical_pitch:
      'Kunden informieren sich gerne über Solaranlagen wegen steigender Strompreise. Du erfasst nur den Termin — verkaufen muss ein Experte.',
    hook_keywords: ['Strompreise', 'Energiewende', 'Solaranlage', 'Dach', 'Eigenheim'],
    strongest_angle: 'winkel_1',
    objection_handling: {
      drueckerei:
        'Es geht nur darum Termine zu erfassen — du verkaufst NICHT. Ein Solar-Experte macht den Rest.',
      keine_ahnung:
        'Musst du auch nicht — du lernst in 2 Tagen alles. Es geht um Terminvereinbarungen, nicht um Technik.',
    },
  },
  glasfaser: {
    product_label: 'Glasfaser-Internet',
    typical_commission: '80–150 EUR pro Vertrag',
    typical_earning_from: 3000,
    typical_earning_to: 6000,
    typical_task_type: 'contract_close',
    typical_pitch:
      'Du berätst Privathaushalte zum Glasfaser-Ausbau und schließt Verträge ab. Die Straße wird sowieso ausgebaut — du bist der Bote mit guten Nachrichten.',
    hook_keywords: ['Glasfaser', 'Internet', 'Ausbau', 'schnelles Internet'],
    strongest_angle: 'winkel_2',
    objection_handling: {
      drueckerei:
        'Du kommst nicht unangekündigt — die Straße wird sowieso ausgebaut. Du bist der Bote mit guten Nachrichten.',
      technik:
        'Es ist eher Beratung als Verkauf. Der Ausbau steht fest, du erklärst die Konditionen.',
    },
  },
  strom_gas: {
    product_label: 'Strom- und Gas-Tarife',
    typical_commission: '50–120 EUR pro Vertrag',
    typical_earning_from: 2500,
    typical_earning_to: 5000,
    typical_task_type: 'contract_close',
    typical_pitch:
      'Du vergleichst Strom- und Gas-Tarife für Privathaushalte und wechselst sie in einen günstigeren Tarif. Die Ersparnis ist real.',
    hook_keywords: ['Stromkosten', 'Gaskosten', 'Tarifwechsel', 'sparen'],
    strongest_angle: 'winkel_1',
    objection_handling: {
      drueckerei:
        'Wir arbeiten mit einem etablierten Energieversorger zusammen. Der Tarifvergleich zeigt schwarz auf weiß die Ersparnis.',
      konkurrenz:
        'Genau deshalb zählt Schnelligkeit. Unsere Leads sind frisch und exklusiv.',
    },
  },
  pv: {
    product_label: 'Photovoltaik / Solaranlagen',
    typical_commission: '200–400 EUR pro Termin/Lead',
    typical_earning_from: 3500,
    typical_earning_to: 7000,
    typical_task_type: 'leads_only',
    typical_pitch:
      'Kunden informieren sich gerne über Solaranlagen wegen steigender Strompreise. Du erfasst nur den Termin — verkaufen muss ein Experte.',
    hook_keywords: ['Strompreise', 'Energiewende', 'Solaranlage', 'Dach', 'Eigenheim'],
    strongest_angle: 'winkel_1',
    objection_handling: {
      drueckerei:
        'Es geht nur darum Termine zu erfassen — du verkaufst NICHT. Ein Solar-Experte macht den Rest.',
      keine_ahnung:
        'Musst du auch nicht — du lernst in 2 Tagen alles. Es geht um Terminvereinbarungen, nicht um Technik.',
    },
  },
};

// ============================================================
// Template Fill Engine
// ============================================================

/**
 * Build a context map of all replaceable fields from OnboardingContext.
 * This handles tone-dependent pronouns, labels, conditional text blocks, etc.
 */
function buildReplacementMap(ctx: OnboardingContext): Record<string, string> {
  const isDu = ctx.tone !== 'sie';

  const earningRange = (() => {
    if (ctx.monthly_earning_from && ctx.monthly_earning_to)
      return `${ctx.monthly_earning_from}–${ctx.monthly_earning_to} EUR`;
    if (ctx.monthly_earning_from) return `ab ${ctx.monthly_earning_from} EUR`;
    if (ctx.monthly_earning_to) return `bis ${ctx.monthly_earning_to} EUR`;
    return 'k.A.';
  })();

  const regions =
    ctx.regions && ctx.regions.length > 0
      ? ctx.regions.join(', ')
      : ctx.region || 'Deutschland';

  const companyDisplay =
    ctx.client_nameable && ctx.client_name
      ? `${ctx.company_name || 'Unbekannt'} (Auftraggeber: ${ctx.client_name})`
      : ctx.company_name || 'Unbekannt';

  const careerLevels = ctx.career_levels || [];
  const topLevel = careerLevels.length > 0 ? lbl(careerLevelLabels, careerLevels[careerLevels.length - 1]) : 'Führungskraft';

  const branchData = ctx.product ? BRANCH_DEFAULTS[ctx.product] : undefined;

  return {
    // Core fields
    company_name: ctx.company_name || 'Unbekannt',
    company_display: companyDisplay,
    job_title: ctx.job_title || 'Vertriebsmitarbeiter',
    regions,
    radius_km: ctx.radius_km ? String(ctx.radius_km) : '',
    product: ctx.product || '',
    product_label: lbl(productLabels, ctx.product),
    earning_range: earningRange,
    monthly_earning_from: ctx.monthly_earning_from ? String(ctx.monthly_earning_from) : 'k.A.',
    monthly_earning_to: ctx.monthly_earning_to ? String(ctx.monthly_earning_to) : 'k.A.',
    compensation_label: lbl(compensationLabels, ctx.compensation),
    commission_per_unit: ctx.commission_per_unit || 'k.A.',
    employment_label: lbl(employmentLabels, ctx.employment_type),
    training_label: lbl(trainingLabels, ctx.training_type),
    career_levels_label: lblArr(careerLevelLabels, ctx.career_levels),
    top_career_level: topLevel,
    extras_label: lblArr(extrasLabels, ctx.extras),
    company_car_from_label: ctx.company_car_from ? lbl(careerLevelLabels, ctx.company_car_from) : '',
    start_date: ctx.start_date || 'Ab sofort',
    contact_name: ctx.contact_name || '[Ansprechpartner]',
    contact_phone: ctx.contact_phone || '[Telefonnummer]',
    primary_color: ctx.primary_color || '#E0354B',
    tone: ctx.tone || 'du',
    tone_label: isDu ? 'Du (informell)' : 'Sie (formell)',

    // Tone-dependent pronouns
    gruss: isDu ? 'Hallo' : 'Guten Tag',
    du: isDu ? 'du' : 'Sie',
    Du: isDu ? 'Du' : 'Sie',
    dich: isDu ? 'dich' : 'Sie',
    dir: isDu ? 'dir' : 'Ihnen',
    dein: isDu ? 'dein' : 'Ihr',
    deine: isDu ? 'deine' : 'Ihre',
    deiner: isDu ? 'deiner' : 'Ihrer',
    deinen: isDu ? 'deinen' : 'Ihren',
    deine_cap: isDu ? 'Deine' : 'Ihre',
    possessiv: isDu ? 'deine' : 'Ihre',
    haben: isDu ? 'Hast du' : 'Haben Sie',
    Hast: isDu ? 'Hast du' : 'Haben Sie',
    Du_hast: isDu ? 'Du hast dich' : 'Sie haben sich',
    du_faehrst: isDu ? 'Du fährst' : 'Sie fahren',
    du_kommst: isDu ? 'Du kommst' : 'Sie kommen',
    du_darfst: isDu ? 'Du darfst' : 'Sie dürfen',
    bist: isDu ? 'bist du' : 'sind Sie',
    bist_du: isDu ? 'Bist du' : 'Sind Sie',
    triffst: isDu ? 'triffst' : 'treffen',
    hast: isDu ? 'hast' : 'haben',
    koennen: isDu ? 'könntest du' : 'könnten Sie',
    koenntest: isDu ? 'könntest du' : 'könnten Sie',
    kannst: isDu ? 'kannst du' : 'können Sie',
    moechtest: isDu ? 'möchtest du' : 'möchten Sie',

    // Conditional text blocks
    experience_text: ctx.experience_needed ? 'mit Vertriebserfahrung' : 'ohne Vorerfahrung',
    experience_short: ctx.experience_needed ? '' : ', keine Erfahrung nötig',
    experience_rule: ctx.experience_needed
      ? '- Vertriebserfahrung als Anforderung benennen'
      : '- "Quereinsteiger willkommen" — KEINE Erfahrung nötig betonen',
    task_type_rule: ctx.task_type === 'leads_only'
      ? '- KEIN "Verkauf" oder "Abschluss" — es geht NUR um Leads/Termine erfassen'
      : '- Vertragsabschluss als Aufgabe klar benennen',
    task_type_description: ctx.task_type === 'leads_only'
      ? `Kein Verkauf nötig — nur Leads/Termine erfassen für ${lbl(productLabels, ctx.product)}.`
      : `Verträge für ${lbl(productLabels, ctx.product)} abschließen — ungedeckelt provisiert.`,
    task_type_pitch: ctx.task_type === 'leads_only'
      ? 'Es geht dabei NICHT um Verkauf — man erfasst nur Kundendaten und Termine.'
      : `Es geht um den Vertrieb von ${lbl(productLabels, ctx.product)} — direkt zum Kunden, Verträge abschließen.`,
    client_rule: ctx.client_nameable && ctx.client_name
      ? `- Auftraggeber "${ctx.client_name}" namentlich nennen`
      : '- Auftraggeber NICHT namentlich nennen',
    client_pitch: ctx.client_nameable && ctx.client_name
      ? `- Auftraggeber: ${ctx.client_name}`
      : '',
    client_benefit: ctx.client_nameable && ctx.client_name
      ? `- Auftraggeber: ${ctx.client_name}`
      : '',
    company_car_rule: ctx.company_car_from
      ? `- Firmenwagen ab ${lbl(careerLevelLabels, ctx.company_car_from)}`
      : '',
    company_car_benefit: ctx.company_car_from
      ? `- Firmenwagen ab Stufe ${lbl(careerLevelLabels, ctx.company_car_from)}`
      : '',
    company_car_line: ctx.company_car_from
      ? `Ab ${lbl(careerLevelLabels, ctx.company_car_from)} gibt es den Firmenwagen dazu.`
      : '',
    extras_benefit: ctx.extras && ctx.extras.length > 0
      ? `- Extras: ${lblArr(extrasLabels, ctx.extras)}`
      : '',
    experience_subline: ctx.experience_needed ? '' : '- Subline 2: "Keine Erfahrung? Kein Problem — Quereinsteiger willkommen."',
    experience_question: ctx.experience_needed
      ? `"Welche Vertriebserfahrung bringst ${isDu ? 'du' : 'Sie'} mit?"`
      : `"${isDu ? 'Hast du' : 'Haben Sie'} schon mal im Vertrieb gearbeitet? Nicht schlimm wenn nicht — wir bilden komplett aus mit ${lbl(trainingLabels, ctx.training_type)}."`,
    experience_vg_question: ctx.experience_needed
      ? `"Welche Vertriebserfahrung ${isDu ? 'bringst du' : 'bringen Sie'} mit?"`
      : `"${isDu ? 'Hast du' : 'Haben Sie'} schon mal was im Vertrieb gemacht? Ist nicht schlimm wenn nicht — wir bilden aus."`,
    mobility_question: ctx.drivers_license_needed
      ? `"${isDu ? 'Hast du' : 'Haben Sie'} einen Führerschein und ein eigenes Auto? Das brauchen wir für die Einsatzgebiete in ${regions}."`
      : `"Wie ${isDu ? 'kommst du' : 'kommen Sie'} zu ${isDu ? 'deinen' : 'Ihren'} Einsatzorten in ${regions}?"`,
    driving_question: ctx.drivers_license_needed
      ? `- Frage: "${isDu ? 'Hast du' : 'Haben Sie'} einen Führerschein + Auto?"\n- Antwort A: "Ja, beides"\n- Antwort B: "Führerschein ja, Auto nein"\n- Antwort C: "Nein"`
      : `- Frage: "Wie ${isDu ? 'kommst du' : 'kommen Sie'} zu ${isDu ? 'deinen' : 'Ihren'} Einsatzorten?"\n- Antwort A: "Eigenes Auto"\n- Antwort B: "ÖPNV / Fahrrad"\n- Antwort C: "Muss ich noch klären"`,
    start_date_suffix: ctx.start_date && ctx.start_date !== 'Ab sofort' ? ` / ab ${ctx.start_date}` : '',
    contact_line: ctx.contact_phone
      ? `Direkt erreichbar unter ${ctx.contact_phone}.`
      : '',
    requirement_answer: ctx.drivers_license_needed
      ? 'Führerschein + Auto'
      : 'Motivation und Lernbereitschaft',
    employment_answer: ctx.employment_type === 'self_employed'
      ? 'Ja, nach §84 HGB — maximale Flexibilität'
      : 'Nein, Festanstellung mit allen Vorteilen',
    typical_day: ctx.task_type === 'leads_only'
      ? `"${isDu ? 'Du fährst' : 'Sie fahren'} in ${isDu ? 'dein' : 'Ihr'} Einsatzgebiet, ${isDu ? 'klingelst' : 'klingeln'} bei Privathaushalten und ${isDu ? 'erfasst' : 'erfassen'} Kundendaten / Termine für ${lbl(productLabels, ctx.product)}. ${isDu ? 'Du musst' : 'Sie müssen'} NICHT verkaufen."`
      : `"${isDu ? 'Du fährst' : 'Sie fahren'} in ${isDu ? 'dein' : 'Ihr'} Einsatzgebiet, ${isDu ? 'berätst' : 'beraten'} Kunden zu ${lbl(productLabels, ctx.product)} und ${isDu ? 'schließt' : 'schließen'} Verträge ab."`,
    career_path_formatted: (ctx.career_levels || []).map((lvl, i) => `${i + 1}. ${lbl(careerLevelLabels, lvl)}`).join('\n'),
    drueckerei_response: ctx.task_type === 'leads_only'
      ? `"Bei uns muss man NICHT verkaufen. Es geht nur um Leads und Termine. Kein Klinkenputzen."`
      : `"Es ist kein Klinkenputzen. Man hat qualifizierte Termine und ${lbl(trainingLabels, ctx.training_type)}."`,

    // Branch-specific hints
    branch_pitch: branchData?.typical_pitch || '',
    branch_keywords: branchData?.hook_keywords?.join(', ') || '',
    branch_strongest_angle: branchData?.strongest_angle || '',
  };
}

/**
 * Fill a template string with context values.
 * Replaces {{field}} placeholders and handles {{#wenn field=value}}...{{/wenn}} conditionals.
 */
export function fillTemplate(template: string, ctx: OnboardingContext): string {
  const map = buildReplacementMap(ctx);

  let result = template;

  // Process conditional blocks: {{#wenn field=value}}...{{/wenn}}
  const conditionalRegex = /\{\{#wenn\s+(\w+)=([^}]+)\}\}([\s\S]*?)\{\{\/wenn\}\}/g;
  result = result.replace(conditionalRegex, (_match, field: string, value: string, content: string) => {
    const actualValue = map[field] ?? '';
    // Support boolean strings
    if (value === 'true' && (actualValue === 'true' || actualValue === '1')) return content;
    if (value === 'false' && (actualValue === 'false' || actualValue === '0' || actualValue === '')) return content;
    // Direct string comparison
    if (actualValue === value) return content;
    // Check against the raw context too
    const rawValue = (ctx as unknown as Record<string, unknown>)[field];
    if (String(rawValue) === value) return content;
    if (value === 'true' && rawValue === true) return content;
    if (value === 'false' && (rawValue === false || rawValue === null || rawValue === undefined)) return content;
    return '';
  });

  // Replace simple placeholders: {{field}}
  result = result.replace(/\{\{(\w+)\}\}/g, (_match, field: string) => {
    return map[field] ?? '';
  });

  // Clean up empty lines created by removed conditionals
  result = result.replace(/\n{3,}/g, '\n\n');

  return result;
}

/**
 * Build the full context string for a given content type.
 * This is what gets passed to the AI system prompt.
 */
export function buildTemplateContext(type: string, ctx: OnboardingContext): string {
  const parts: string[] = [];

  switch (type) {
    case 'ad_copy': {
      parts.push('=== GENERATOR REGELN ===');
      parts.push(GENERATOR_RULES);
      parts.push('');
      parts.push('=== AGENTUR-DATEN ===');
      parts.push(buildAgencyDataBlock(ctx));
      parts.push('');

      // Branch-specific context
      const branch = ctx.product ? BRANCH_DEFAULTS[ctx.product] : undefined;
      if (branch) {
        parts.push('=== BRANCHEN-KONTEXT ===');
        parts.push(`Branche: ${branch.product_label}`);
        parts.push(`Stärkster Winkel: ${branch.strongest_angle}`);
        parts.push(`Typischer Pitch: ${branch.typical_pitch}`);
        parts.push(`Hook-Keywords: ${branch.hook_keywords.join(', ')}`);
        parts.push('');
      }

      parts.push('=== WINKEL 1: GELD (4 Varianten generieren) ===');
      parts.push(fillTemplate(AD_TEMPLATE_WINKEL_1, ctx));
      parts.push('');
      parts.push('=== WINKEL 2: FREIHEIT (3 Varianten generieren) ===');
      parts.push(fillTemplate(AD_TEMPLATE_WINKEL_2, ctx));
      parts.push('');
      parts.push('=== WINKEL 3: KARRIERE (3 Varianten generieren) ===');
      parts.push(fillTemplate(AD_TEMPLATE_WINKEL_3, ctx));
      parts.push('');
      parts.push('INSGESAMT: 10 Anzeigen-Varianten (4x Winkel 1, 3x Winkel 2, 3x Winkel 3).');
      parts.push('Jede Variante klar nummeriert mit Winkel-Bezeichnung.');
      parts.push(`Tonalität: ${ctx.tone === 'sie' ? 'Sie (formell)' : 'Du (informell)'}, direkt, motivierend, mit Emojis.`);
      break;
    }

    case 'phone_script': {
      parts.push('=== GENERATOR REGELN ===');
      parts.push(GENERATOR_RULES);
      parts.push('');
      parts.push('Erstelle ein Telefon-Skript nach dieser Vorlage. Fülle alle Platzhalter mit den konkreten Agentur-Daten aus und mache das Skript gesprächsbereit.');
      parts.push('');
      parts.push(fillTemplate(PHONE_SCRIPT_TEMPLATE, ctx));
      break;
    }

    case 'funnel_text': {
      parts.push('=== GENERATOR REGELN ===');
      parts.push(GENERATOR_RULES);
      parts.push('');
      parts.push('Erstelle Funnel-Texte für alle 7 Screens nach dieser Vorlage. Conversion-optimiert, kurz und knackig.');
      parts.push('');
      parts.push(fillTemplate(FUNNEL_TEMPLATE, ctx));
      break;
    }

    case 'video_script': {
      parts.push('=== GENERATOR REGELN ===');
      parts.push(GENERATOR_RULES);
      parts.push('');
      parts.push('Erstelle ein 60–90 Sekunden Video-Skript für ein Recruiting-Video. Nutze den VG-Leitfaden als inhaltliche Referenz für die Firma/Stelle.');
      parts.push('');
      parts.push('=== REFERENZ: VG-LEITFADEN ===');
      parts.push(fillTemplate(VG_LEITFADEN_TEMPLATE, ctx));
      parts.push('');
      parts.push('=== VIDEO-SKRIPT STRUKTUR ===');
      parts.push('1. Hook (3 Sek.) — Problem ansprechen');
      parts.push('2. Vorstellung (5 Sek.) — Name, Firma');
      parts.push('3. Was macht man? (15 Sek.) — Konkrete Aufgabe');
      parts.push('4. 3 Key Benefits (20 Sek.) — Verdienst, Karriere, Ausbildung');
      parts.push('5. Social Proof (10 Sek.) — Team, Erfolge');
      parts.push('6. CTA (5 Sek.) — "Jetzt bewerben"');
      parts.push(`Tonalität: Authentisch, energisch, ${ctx.tone === 'sie' ? 'Sie' : 'Du'}-Ansprache. KEINE Emojis.`);
      break;
    }

    case 'job_posting': {
      parts.push('=== GENERATOR REGELN ===');
      parts.push(GENERATOR_RULES);
      parts.push('');
      parts.push('=== AGENTUR-DATEN ===');
      parts.push(buildAgencyDataBlock(ctx));
      parts.push('');
      parts.push('HINWEIS: Indeed-Templates werden von Felix geliefert und sind noch in Arbeit.');
      parts.push('Erstelle eine SEO-optimierte Indeed-Stellenanzeige mit folgender Struktur:');
      parts.push('1. SEO-optimierter Stellentitel (mit Region und Schlagwörtern)');
      parts.push('2. Einleitung (2 Sätze Hook)');
      parts.push('3. Deine Aufgaben (5-6 Punkte)');
      parts.push('4. Dein Profil (4-5 Punkte)');
      parts.push('5. Wir bieten (6-8 Benefits mit Verdienst)');
      parts.push('6. Vergütung (transparent)');
      parts.push(`Tonalität: ${ctx.tone === 'sie' ? 'Sie (formell)' : 'Du (informell)'}, mit Emojis.`);
      break;
    }

    case 'creative_brief': {
      parts.push('=== GENERATOR REGELN ===');
      parts.push(GENERATOR_RULES);
      parts.push('');
      parts.push('=== AGENTUR-DATEN ===');
      parts.push(buildAgencyDataBlock(ctx));
      parts.push('');
      parts.push('Erstelle ein Creative-Brief für Recruiting-Anzeigenbilder:');
      parts.push('- 3 Bildkonzepte mit Beschreibung');
      parts.push('- Text-Overlays pro Bild (Headline + Subline)');
      parts.push(`- Primärfarbe: ${ctx.primary_color || '#E0354B'}`);
      parts.push('- Format-Empfehlungen (1080x1080 Feed, 1080x1920 Story)');
      parts.push('- Do\'s und Don\'ts für D2D-Recruiting Creatives');
      break;
    }

    case 'vg_leitfaden': {
      parts.push('=== GENERATOR REGELN ===');
      parts.push(GENERATOR_RULES);
      parts.push('');
      parts.push('Erstelle einen vollständigen Vorstellungsgespräch-Leitfaden. Fülle alle Platzhalter mit den konkreten Agentur-Daten aus. Der Leitfaden soll gesprächsbereit sein — kein Ablesen, sondern Führung.');
      parts.push('');
      parts.push(fillTemplate(VG_LEITFADEN_TEMPLATE, ctx));
      break;
    }

    case 'follow_up': {
      parts.push('=== GENERATOR REGELN ===');
      parts.push(GENERATOR_RULES);
      parts.push('');
      parts.push('Erstelle alle Follow-Up-Skripte für den Recruiting-Prozess. Fülle alle Platzhalter mit den konkreten Agentur-Daten aus. Skripte müssen kurz, direkt und ohne Emojis sein.');
      parts.push('');
      parts.push(fillTemplate(FOLLOW_UP_TEMPLATES.nach_vq, ctx));
      parts.push('');
      parts.push('---');
      parts.push('');
      parts.push(fillTemplate(FOLLOW_UP_TEMPLATES.nach_vg, ctx));
      parts.push('');
      parts.push('---');
      parts.push('');
      parts.push(fillTemplate(FOLLOW_UP_TEMPLATES.nach_probetag, ctx));
      break;
    }

    case 'absage': {
      parts.push('=== GENERATOR REGELN ===');
      parts.push(GENERATOR_RULES);
      parts.push('');
      parts.push('Erstelle alle Absage-Skripte für den Recruiting-Prozess. Fülle alle Platzhalter mit den konkreten Agentur-Daten aus. Skripte müssen freundlich, kurz und professionell sein.');
      parts.push('');
      parts.push(fillTemplate(ABSAGE_TEMPLATES.telefon, ctx));
      parts.push('');
      parts.push('---');
      parts.push('');
      parts.push(fillTemplate(ABSAGE_TEMPLATES.nach_vg, ctx));
      parts.push('');
      parts.push('---');
      parts.push('');
      parts.push(fillTemplate(ABSAGE_TEMPLATES.schriftlich, ctx));
      break;
    }

    default: {
      parts.push(GENERATOR_RULES);
      parts.push('');
      parts.push(buildAgencyDataBlock(ctx));
    }
  }

  return parts.join('\n');
}

/**
 * Build the agency data summary block used across templates.
 */
function buildAgencyDataBlock(ctx: OnboardingContext): string {
  const isDu = ctx.tone !== 'sie';
  const regions =
    ctx.regions && ctx.regions.length > 0 ? ctx.regions.join(', ') : ctx.region || 'Deutschland';
  const earningRange = (() => {
    if (ctx.monthly_earning_from && ctx.monthly_earning_to)
      return `${ctx.monthly_earning_from}–${ctx.monthly_earning_to} EUR/Monat`;
    if (ctx.monthly_earning_from) return `ab ${ctx.monthly_earning_from} EUR/Monat`;
    if (ctx.monthly_earning_to) return `bis ${ctx.monthly_earning_to} EUR/Monat`;
    return 'k.A.';
  })();

  const lines = [
    `FIRMA: ${ctx.company_name || 'Unbekannt'}`,
    ctx.client_nameable && ctx.client_name ? `AUFTRAGGEBER: ${ctx.client_name} (nennbar)` : 'AUFTRAGGEBER: Nicht nennbar',
    `STELLE: ${ctx.job_title || 'Vertriebsmitarbeiter'}`,
    `REGION: ${regions}${ctx.radius_km ? ` (Radius ${ctx.radius_km} km)` : ''}`,
    `PRODUKT: ${lbl(productLabels, ctx.product)}`,
    `AUFGABE: ${lbl(taskTypeLabels, ctx.task_type)}`,
    `VERGÜTUNG: ${lbl(compensationLabels, ctx.compensation)}, ${ctx.commission_per_unit || 'k.A.'}`,
    `VERDIENST: ${earningRange}`,
    `ANSTELLUNG: ${lbl(employmentLabels, ctx.employment_type)}`,
    `KARRIERE: ${lblArr(careerLevelLabels, ctx.career_levels)}`,
    ctx.company_car_from ? `FIRMENWAGEN: Ab ${lbl(careerLevelLabels, ctx.company_car_from)}` : 'FIRMENWAGEN: Nein',
    `AUSBILDUNG: ${lbl(trainingLabels, ctx.training_type)}`,
    `EXTRAS: ${lblArr(extrasLabels, ctx.extras)}`,
    `QUEREINSTEIGER: ${ctx.experience_needed ? 'Nein — Erfahrung nötig' : 'Ja, willkommen'}`,
    `FÜHRERSCHEIN: ${ctx.drivers_license_needed ? 'Pflicht' : 'Nicht zwingend'}`,
    `STARTDATUM: ${ctx.start_date || 'Ab sofort'}`,
    `ANSPRACHE: ${isDu ? 'Du (informell)' : 'Sie (formell)'}`,
    `PRIMÄRFARBE: ${ctx.primary_color || '#E0354B'}`,
  ];

  return lines.join('\n');
}
