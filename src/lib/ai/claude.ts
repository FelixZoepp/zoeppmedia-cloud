import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic();

export type ContentType = 'ad_copy' | 'phone_script' | 'video_script' | 'funnel_text' | 'job_posting' | 'creative_brief';

export interface OnboardingContext {
  company_name: string | null;
  industry: string | null;
  region: string | null;
  employee_count: string | null;
  hiring_target: number | null;
  hiring_timeframe: string | null;
  experience_required: string | null;
  compensation_model: string | null;
  usps: string | null;
  primary_color: string | null;
  // D2D-specific fields
  job_title: string | null;
  regions: string[] | null;
  radius_km: number | null;
  product: string | null;
  task_type: string | null;
  compensation: string | null;
  commission_per_unit: string | null;
  monthly_earning_from: number | null;
  monthly_earning_to: number | null;
  employment_type: string | null;
  career_levels: string[] | null;
  company_car_from: string | null;
  training_type: string | null;
  client_nameable: boolean;
  client_name: string | null;
  extras: string[] | null;
  experience_needed: boolean;
  drivers_license_needed: boolean;
  start_date: string | null;
  career_page_url: string | null;
  tone: string | null;
  contact_name: string | null;
}

// Human-readable label maps
const productLabels: Record<string, string> = {
  pv: 'Photovoltaik',
  glasfaser: 'Glasfaser',
  strom_gas: 'Strom & Gas',
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

function label(map: Record<string, string>, key: string | null): string {
  if (!key) return 'k.A.';
  return map[key] || key;
}

function labelArray(map: Record<string, string>, keys: string[] | null): string {
  if (!keys || keys.length === 0) return 'k.A.';
  return keys.map((k) => map[k] || k).join(', ');
}

function earningRange(ctx: OnboardingContext): string {
  if (ctx.monthly_earning_from && ctx.monthly_earning_to) {
    return `${ctx.monthly_earning_from}–${ctx.monthly_earning_to}€/Monat`;
  }
  if (ctx.monthly_earning_from) return `ab ${ctx.monthly_earning_from}€/Monat`;
  if (ctx.monthly_earning_to) return `bis ${ctx.monthly_earning_to}€/Monat`;
  return 'k.A.';
}

function regionsStr(ctx: OnboardingContext): string {
  if (ctx.regions && ctx.regions.length > 0) return ctx.regions.join(', ');
  if (ctx.region) return ctx.region;
  return 'Deutschland';
}

function toneStr(ctx: OnboardingContext): string {
  return ctx.tone === 'sie' ? 'Sie (formell)' : 'Du (informell)';
}

function companyDisplay(ctx: OnboardingContext): string {
  if (ctx.client_nameable && ctx.client_name) {
    return `${ctx.company_name || 'Unbekannt'} (Auftraggeber: ${ctx.client_name})`;
  }
  return ctx.company_name || 'Unbekannt';
}

export function buildSystemPrompt(type: ContentType, ctx: OnboardingContext): string {
  const typePrompts: Record<ContentType, string> = {
    ad_copy: `Du erstellst Facebook/Instagram Recruiting-Anzeigen für D2D-Vertrieb.

STELLE: ${ctx.job_title || 'Vertriebsmitarbeiter'} in ${regionsStr(ctx)}
UNTERNEHMEN: ${companyDisplay(ctx)}
PRODUKT: ${label(productLabels, ctx.product)} — Aufgabe: ${label(taskTypeLabels, ctx.task_type)}
VERGÜTUNG: ${label(compensationLabels, ctx.compensation)}, ${ctx.commission_per_unit || 'k.A.'}, ${earningRange(ctx)}
ANSTELLUNG: ${label(employmentLabels, ctx.employment_type)}
KARRIERE: ${labelArray(careerLevelLabels, ctx.career_levels)}
AUSBILDUNG: ${label(trainingLabels, ctx.training_type)}
EXTRAS: ${labelArray(extrasLabels, ctx.extras)}
FIRMENWAGEN: ${ctx.company_car_from ? `ab ${label(careerLevelLabels, ctx.company_car_from)}` : 'Nein'}
VORWISSEN: ${ctx.experience_needed ? 'Vertriebserfahrung nötig' : 'Nicht nötig — Quereinsteiger willkommen'}
FÜHRERSCHEIN: ${ctx.drivers_license_needed ? 'Pflicht' : 'Nicht zwingend'}
STARTDATUM: ${ctx.start_date || 'Ab sofort'}
ANSPRACHE: ${toneStr(ctx)} mit Emojis

Erstelle 3 Varianten:
1. Story-Hook (Problem → Lösung) — 125 Zeichen max. Primärer Text für eine Story-Ad.
2. Standard Feed Ad — Headline + Primary Text + CTA. Unter 250 Zeichen Primary Text.
3. Carousel/Long-Form — ausführlich mit allen Benefits. Bis 500 Zeichen.

Jede Variante MUSS enthalten:
- Realistischen Verdienst (${earningRange(ctx)})
- ${ctx.task_type === 'leads_only' ? 'Dass KEIN Verkauf nötig ist — nur Leads erfassen' : 'Vertragsabschluss als Aufgabe klar benennen'}
- ${ctx.experience_needed ? 'Welche Erfahrung erwartet wird' : 'Quereinsteiger willkommen — keine Erfahrung nötig'}
- Konkreten CTA mit Link-Platzhalter [LINK]
- ${ctx.client_nameable && ctx.client_name ? `Den Auftraggeber "${ctx.client_name}" namentlich nennen` : 'Auftraggeber NICHT namentlich nennen'}

Tonalität: Direkt, motivierend, keine Floskeln. ${toneStr(ctx)}-Ansprache durchgehend.`,

    phone_script: `Du erstellst ein Telefon-Skript für das Nachfassen von D2D-Recruiting-Bewerbern.

STELLE: ${ctx.job_title || 'Vertriebsmitarbeiter'} bei ${ctx.company_name || 'Unbekannt'}
PRODUKT: ${label(productLabels, ctx.product)}
AUFGABE: ${label(taskTypeLabels, ctx.task_type)}
VERDIENST: ${earningRange(ctx)}
ANSPRACHE: ${toneStr(ctx)}
ANSPRECHPARTNER: ${ctx.contact_name || '[Name des Anrufers]'}
FÜHRERSCHEIN NÖTIG: ${ctx.drivers_license_needed ? 'Ja' : 'Nein'}
STARTDATUM: ${ctx.start_date || 'Ab sofort'}
VORWISSEN NÖTIG: ${ctx.experience_needed ? 'Ja' : 'Nein'}

Skript-Struktur:
1. Begrüßung: "${ctx.tone === 'sie' ? 'Guten Tag' : 'Hallo'} [Name], hier ist ${ctx.contact_name || '[Ansprechpartner]'} von ${ctx.company_name || '[Firma]'}..."
2. Bezug: "${ctx.tone === 'sie' ? 'Sie haben sich' : 'Du hast dich'} bei uns auf die Stelle als ${ctx.job_title || 'Vertriebsmitarbeiter'} beworben..."
3. Kurz-Pitch: Was macht man konkret? (2 Sätze zum Produkt ${label(productLabels, ctx.product)} und zur Aufgabe ${label(taskTypeLabels, ctx.task_type)})
4. Qualifizierung: 3 Fragen:
   - ${ctx.drivers_license_needed ? 'Führerschein und eigenes Fahrzeug vorhanden?' : 'Mobilität — wie kommst du zu den Einsatzorten?'}
   - Wann ${ctx.tone === 'sie' ? 'könnten Sie' : 'könntest du'} starten?
   - ${ctx.experience_needed ? 'Welche Vertriebserfahrung bringst du mit?' : 'Hast du schon mal im Vertrieb gearbeitet? (Nicht schlimm wenn nicht!)'}
5. Verdienst-Teaser: "${earningRange(ctx)} sind realistisch nach Einarbeitung"
6. Termin: "Wann passt es ${ctx.tone === 'sie' ? 'Ihnen' : 'dir'} diese Woche für ein kurzes Vorstellungsgespräch?"
7. Einwandbehandlung:
   - "Kein Interesse mehr" → Kurz nachfragen warum, ggf. Verdienst nochmal betonen
   - "Keine Zeit gerade" → Konkreten Rückruf-Termin vereinbaren
   - "Muss überlegen" → Verständnis zeigen, 24h Follow-up ankündigen
8. Verabschiedung mit konkretem nächsten Schritt (Termin bestätigen oder Rückruf-Zeitpunkt)

Tonalität: ${toneStr(ctx)}, freundlich, nicht aufdringlich. Das Skript muss sich wie ein natürliches Gespräch lesen.`,

    video_script: `Du erstellst ein Skript für ein 60-90 Sekunden Recruiting-Video für D2D-Vertrieb.

STELLE: ${ctx.job_title || 'Vertriebsmitarbeiter'} bei ${companyDisplay(ctx)}
PRODUKT: ${label(productLabels, ctx.product)}
AUFGABE: ${label(taskTypeLabels, ctx.task_type)}
VERDIENST: ${earningRange(ctx)}
KARRIERE: ${labelArray(careerLevelLabels, ctx.career_levels)}
EXTRAS: ${labelArray(extrasLabels, ctx.extras)}
ANSPRACHE: ${toneStr(ctx)}
QUEREINSTEIGER: ${ctx.experience_needed ? 'Nein — Erfahrung nötig' : 'Ja — willkommen'}

Skript-Struktur:
1. Hook (erste 3 Sekunden) — Problem ansprechen: "Genug von [typischem Problem]?"
2. Sich vorstellen (5 Sekunden) — Name, Firma, was ihr macht
3. Was macht man konkret? (15 Sekunden) — ${label(taskTypeLabels, ctx.task_type)} im Bereich ${label(productLabels, ctx.product)}
4. 3 Key Benefits (20 Sekunden) — Verdienst, Karrierestufen, Ausbildung
5. Social Proof (10 Sekunden) — Team, Erfolge, ${ctx.client_nameable && ctx.client_name ? `Auftraggeber ${ctx.client_name}` : 'bekannte Auftraggeber'}
6. Call-to-Action (5 Sekunden) — "Link in Bio" oder "Jetzt bewerben"

Tonalität: Authentisch, energisch, wie ein echter Mitarbeiter spricht. ${toneStr(ctx)}.`,

    job_posting: `Du erstellst eine Indeed-Stellenanzeige für D2D-Vertrieb.

STELLE: ${ctx.job_title || 'Vertriebsmitarbeiter'} bei ${companyDisplay(ctx)}
REGIONEN: ${regionsStr(ctx)}${ctx.radius_km ? ` (Radius ${ctx.radius_km} km)` : ''}
PRODUKT: ${label(productLabels, ctx.product)}
AUFGABE: ${label(taskTypeLabels, ctx.task_type)}
VERGÜTUNG: ${label(compensationLabels, ctx.compensation)}, ${ctx.commission_per_unit || 'k.A.'}
VERDIENST: ${earningRange(ctx)}
ANSTELLUNG: ${label(employmentLabels, ctx.employment_type)}
KARRIERE: ${labelArray(careerLevelLabels, ctx.career_levels)}
FIRMENWAGEN: ${ctx.company_car_from ? `ab ${label(careerLevelLabels, ctx.company_car_from)}` : 'Nein'}
AUSBILDUNG: ${label(trainingLabels, ctx.training_type)}
EXTRAS: ${labelArray(extrasLabels, ctx.extras)}
VORWISSEN: ${ctx.experience_needed ? 'Erfahrung erwünscht' : 'Quereinsteiger willkommen'}
FÜHRERSCHEIN: ${ctx.drivers_license_needed ? 'Pflicht' : 'Nicht zwingend'}
STARTDATUM: ${ctx.start_date || 'Ab sofort'}
ANSPRACHE: ${toneStr(ctx)}

Struktur:
1. SEO-optimierter Stellentitel (mit Region und Schlagwörtern)
2. Einleitung (2 Sätze Hook — warum diese Stelle besonders ist)
3. Deine Aufgaben (5-6 Punkte, konkret zum Produkt ${label(productLabels, ctx.product)})
4. Dein Profil (4-5 Punkte, ${ctx.experience_needed ? 'mit Erfahrungsanforderung' : 'Quereinsteiger explizit willkommen'})
5. Wir bieten (6-8 Benefits, inklusive Verdienst, Karrierestufen, Extras)
6. Vergütung (transparent: ${label(compensationLabels, ctx.compensation)}, ${earningRange(ctx)})

Immer ${toneStr(ctx)}-Ansprache durchgehend. Mit Emojis für bessere Lesbarkeit.`,

    funnel_text: `Du erstellst Texte für einen Perspective Recruiting-Funnel (Mobile Landing Page) für D2D-Vertrieb.

STELLE: ${ctx.job_title || 'Vertriebsmitarbeiter'} bei ${companyDisplay(ctx)}
REGIONEN: ${regionsStr(ctx)}
PRODUKT: ${label(productLabels, ctx.product)}
AUFGABE: ${label(taskTypeLabels, ctx.task_type)}
VERDIENST: ${earningRange(ctx)}
KARRIERE: ${labelArray(careerLevelLabels, ctx.career_levels)}
FIRMENWAGEN: ${ctx.company_car_from ? `ab ${label(careerLevelLabels, ctx.company_car_from)}` : 'Nein'}
AUSBILDUNG: ${label(trainingLabels, ctx.training_type)}
EXTRAS: ${labelArray(extrasLabels, ctx.extras)}
QUEREINSTEIGER: ${ctx.experience_needed ? 'Nein' : 'Ja, willkommen'}
FÜHRERSCHEIN: ${ctx.drivers_license_needed ? 'Pflicht' : 'Nicht zwingend'}
ANSPRACHE: ${toneStr(ctx)}
PRIMÄRFARBE: ${ctx.primary_color || '#E0354B'}

Erstelle Texte für diese 7 Funnel-Screens:

SCREEN 1 — Startseite:
- Headline: "${ctx.job_title || 'Vertriebsmitarbeiter'} in ${regionsStr(ctx)} — ungedeckelt verdienen" (oder besser)
- Subline: Produkt ${label(productLabels, ctx.product)} und Aufgabe kurz beschreiben
- CTA-Button: "Jetzt bewerben"

SCREEN 2 — Qualifizierung 1:
- Frage: "${ctx.tone === 'sie' ? 'Haben Sie' : 'Hast du'} bereits Vertriebserfahrung?"
- Antworten: "Ja, im Außendienst" / "Ja, aber nicht D2D" / "Nein, bin Quereinsteiger"

SCREEN 3 — Qualifizierung 2:
- Frage: "${ctx.tone === 'sie' ? 'Besitzen Sie' : 'Besitzt du'} einen Führerschein?"
- Antworten: "Ja" / "Nein, aber in Planung" / "Nein"

SCREEN 4 — Qualifizierung 3:
- Frage: "Wann ${ctx.tone === 'sie' ? 'könnten Sie' : 'könntest du'} starten?"
- Antworten: "Sofort" / "In 2 Wochen" / "In 1-2 Monaten"

SCREEN 5 — Proof / Benefits:
- Headline: "Das erwartet ${ctx.tone === 'sie' ? 'Sie' : 'dich'}"
- Bullet-Points:
  * Verdienst: ${earningRange(ctx)}
  * Ausbildung: ${label(trainingLabels, ctx.training_type)}
  * Karrierestufen: ${labelArray(careerLevelLabels, ctx.career_levels)}
  ${ctx.company_car_from && ctx.company_car_from !== 'nein' ? `* Firmenwagen ab ${label(careerLevelLabels, ctx.company_car_from)}` : ''}
  ${ctx.client_nameable && ctx.client_name ? `* Auftraggeber: ${ctx.client_name}` : ''}
  ${ctx.extras && ctx.extras.length > 0 ? `* Extras: ${labelArray(extrasLabels, ctx.extras)}` : ''}

SCREEN 6 — Kontaktdaten:
- Headline: "Fast geschafft — ${ctx.tone === 'sie' ? 'Ihre' : 'deine'} Daten"
- Felder: Vorname, Nachname, Telefonnummer, E-Mail
- Hinweis: "Wir melden uns innerhalb von 24 Stunden"

SCREEN 7 — Danke:
- Headline: "Bewerbung erhalten!"
- Text: "Wir melden uns innerhalb von 24h bei ${ctx.tone === 'sie' ? 'Ihnen' : 'dir'}. ${ctx.tone === 'sie' ? 'Schauen Sie' : 'Schau'} gerne auf unser Profil für mehr Einblicke."

Tonalität: Conversion-optimiert, ${toneStr(ctx)}, mit Emojis. Jeder Screen maximal 2-3 kurze Sätze.`,

    creative_brief: `Du erstellst ein Creative-Brief für Recruiting-Anzeigenbilder im D2D-Vertrieb.

STELLE: ${ctx.job_title || 'Vertriebsmitarbeiter'} bei ${companyDisplay(ctx)}
PRODUKT: ${label(productLabels, ctx.product)}
VERDIENST: ${earningRange(ctx)}
QUEREINSTEIGER: ${ctx.experience_needed ? 'Nein' : 'Ja, willkommen'}
PRIMÄRFARBE: ${ctx.primary_color || '#E0354B'}

Beschreibe:
- 3 Bildkonzepte mit Beschreibung (was ist zu sehen, Stimmung, Farben)
- Text-Overlays pro Bild (Headline + Subline)
- Empfohlene Primärfarbe: ${ctx.primary_color || '#E0354B'}
- Format-Empfehlungen (1080x1080 Feed, 1080x1920 Story)
- Do's und Don'ts für D2D-Recruiting Creatives

Jedes Bildkonzept muss den Verdienst (${earningRange(ctx)}) und die Stelle (${ctx.job_title || 'Vertriebsmitarbeiter'}) prominent zeigen.`,
  };

  return typePrompts[type];
}

export async function generateContent(
  type: ContentType,
  context: OnboardingContext,
  previousVersion?: string,
  feedback?: string
): Promise<string> {
  const systemPrompt = buildSystemPrompt(type, context);

  let userMessage = `Generiere den Content jetzt.`;
  if (previousVersion && feedback) {
    userMessage = `Hier ist die vorherige Version:\n\n${previousVersion}\n\nFeedback: ${feedback}\n\nBitte überarbeite den Content basierend auf dem Feedback.`;
  }

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text || '';
}

export async function chatWithClaude(
  messages: { role: 'user' | 'assistant'; content: string }[],
  systemPrompt: string
): Promise<string> {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 2000,
    system: systemPrompt,
    messages,
  });

  const textBlock = response.content.find(b => b.type === 'text');
  return textBlock?.text || '';
}
